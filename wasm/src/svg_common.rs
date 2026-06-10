use usvg::{Options, Tree};
use wasm_bindgen::prelude::*;

pub(crate) const MAX_SVG_BYTES: usize = 10 * 1024 * 1024;
const FONT: &[u8] = include_bytes!("../assets/DejaVuSans.ttf");

pub(crate) fn validate_svg_input(input: &str) -> Result<&str, JsValue> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(JsValue::from_str("empty SVG input"));
    }
    if trimmed.len() > MAX_SVG_BYTES {
        return Err(JsValue::from_str(&format!(
            "SVG too large (max {} bytes)",
            MAX_SVG_BYTES
        )));
    }
    if !looks_like_svg(trimmed) {
        return Err(JsValue::from_str("input does not look like SVG"));
    }
    Ok(trimmed)
}

pub(crate) fn parse_svg_tree(input: &str) -> Result<Tree, JsValue> {
    let trimmed = validate_svg_input(input)?;
    let preprocessed = preprocess_svg_xml(trimmed);
    let mut options = Options::default();
    options.fontdb_mut().load_font_data(FONT.to_vec());

    Tree::from_str(&preprocessed, &options)
        .map_err(|e| JsValue::from_str(&format!("SVG parse error: {e}")))
}

fn looks_like_svg(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    lower.contains("<svg") || lower.starts_with("<?xml")
}

/// Illustrator / Figma などが付与するメタデータ・エディタ要素・属性を事前に除去する。
pub(crate) fn preprocess_svg_xml(svg: &str) -> String {
    let mut s = svg.to_string();
    remove_xml_comments(&mut s);
    remove_block_element(&mut s, "<metadata", "</metadata>");
    remove_block_element(&mut s, "<title", "</title>");
    remove_block_element(&mut s, "<desc", "</desc>");
    for prefix in EDITOR_ELEMENT_PREFIXES {
        remove_namespaced_elements(&mut s, prefix);
    }
    strip_editor_attributes(&mut s);
    s
}

const EDITOR_ELEMENT_PREFIXES: &[&str] = &[
    "sodipodi:",
    "inkscape:",
    "sketch:",
    "figma:",
    "af:",
];

const EDITOR_ATTR_PREFIXES: &[&str] = &[
    "inkscape:",
    "sodipodi:",
    "sketch:",
    "figma:",
    "data-figma-",
    "data-name",
    "data-layer",
    "data-sketch-",
    "aapt:",
    "xmlns:sketch",
    "xmlns:figma",
];

fn remove_xml_comments(s: &mut String) {
    while let Some(start) = s.find("<!--") {
        if let Some(rel_end) = s[start..].find("-->") {
            let end = start + rel_end + 3;
            s.replace_range(start..end, "");
        } else {
            break;
        }
    }
}

fn remove_block_element(s: &mut String, open: &str, close: &str) {
    while let Some(start) = s.find(open) {
        if let Some(rel_end) = s[start..].find(close) {
            let end = start + rel_end + close.len();
            s.replace_range(start..end, "");
        } else {
            break;
        }
    }
}

fn remove_namespaced_elements(s: &mut String, prefix: &str) {
    let open = format!("<{prefix}");
    while let Some(start) = s.find(&open) {
        let Some(rel_end) = s[start..].find('>') else {
            break;
        };
        let tag_end = start + rel_end + 1;
        let tag = &s[start..tag_end];
        if tag.ends_with("/>") {
            s.replace_range(start..tag_end, "");
            continue;
        }
        let tag_name = tag
            .trim_start_matches('<')
            .split_whitespace()
            .next()
            .unwrap_or(prefix);
        let close = format!("</{tag_name}>");
        if let Some(rel_close) = s[tag_end..].find(&close) {
            let end = tag_end + rel_close + close.len();
            s.replace_range(start..end, "");
        } else {
            s.replace_range(start..tag_end, "");
        }
    }
}

fn strip_editor_attributes(s: &mut String) {
    let mut i = 0;
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());

    while i < bytes.len() {
        if bytes[i] == b' ' || bytes[i] == b'\n' || bytes[i] == b'\t' {
            let start = i;
            while i < bytes.len() && matches!(bytes[i], b' ' | b'\n' | b'\t') {
                i += 1;
            }
            if i < bytes.len() && bytes[i] != b'>' && bytes[i] != b'/' {
                let attr_start = i;
                while i < bytes.len() && bytes[i] != b'=' && bytes[i] != b'>' {
                    i += 1;
                }
                let attr_name = &s[attr_start..i];
                if EDITOR_ATTR_PREFIXES
                    .iter()
                    .any(|p| attr_name.eq_ignore_ascii_case(p) || attr_name.starts_with(p))
                {
                    if i < bytes.len() && bytes[i] == b'=' {
                        i += 1;
                        if i < bytes.len() && (bytes[i] == b'"' || bytes[i] == b'\'') {
                            let quote = bytes[i];
                            i += 1;
                            while i < bytes.len() && bytes[i] != quote {
                                i += 1;
                            }
                            if i < bytes.len() {
                                i += 1;
                            }
                        }
                    }
                    continue;
                }
                out.push_str(&s[start..i]);
                continue;
            }
            out.push_str(&s[start..i]);
            continue;
        }
        out.push(bytes[i] as char);
        i += 1;
    }

    *s = out;
}
