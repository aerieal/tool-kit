use image::imageops::FilterType as ResizeFilter;
use image::GenericImageView;
use std::collections::HashSet;
use std::io::{Cursor, Write};
use std::path::Path;
use wasm_bindgen::prelude::*;
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::encode::{encode_image_with_format_str, extension_for_format};
use crate::js_input::{parse_image_entries, ImageEntry};
use crate::target_dimensions;

const MAX_ZIP_BYTES: usize = 100 * 1024 * 1024;

/// 複数画像をリサイズ・変換し、ZIP に格納する。
/// `preserve_original_names` が true のときは元ファイル名の stem + 新拡張子を使う。
#[wasm_bindgen]
pub fn batch_process_to_zip(
    images: JsValue,
    prefix: &str,
    target_format: &str,
    quality: u8,
    max_width: Option<u32>,
    max_height: Option<u32>,
    preserve_original_names: bool,
) -> Result<Vec<u8>, JsValue> {
    let entries = parse_image_entries(&images)?;
    let quality = quality.clamp(1, 100);
    let ext = extension_for_format(target_format)?;
    let prefix = sanitize_prefix(prefix);

    let total = entries.len();
    let pad = total.max(1).to_string().len().max(2);

    let mut cursor = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(&mut cursor);
    let options: FileOptions<()> =
        FileOptions::default().compression_method(CompressionMethod::Deflated);
    let mut used_names = HashSet::new();

    for (index, entry) in entries.iter().enumerate() {
        let img = image::load_from_memory(&entry.data)
            .map_err(|e| JsValue::from_str(&format!("{}: {e}", entry.name)))?;

        let (src_w, src_h) = img.dimensions();
        let (dst_w, dst_h) = target_dimensions(src_w, src_h, max_width, max_height);
        let img = if (dst_w, dst_h) != (src_w, src_h) {
            img.resize(dst_w, dst_h, ResizeFilter::Lanczos3)
        } else {
            img
        };

        let bytes = encode_image_with_format_str(&img, target_format, quality)?;
        let filename = zip_entry_filename(
            entry,
            ext,
            index,
            &prefix,
            pad,
            preserve_original_names,
            &mut used_names,
        );

        zip.start_file(filename, options)
            .map_err(|e| JsValue::from_str(&format!("zip start: {e}")))?;
        zip.write_all(&bytes)
            .map_err(|e| JsValue::from_str(&format!("zip write: {e}")))?;
    }

    zip.finish()
        .map_err(|e| JsValue::from_str(&format!("zip finish: {e}")))?;

    let zip_bytes = cursor.into_inner();
    if zip_bytes.len() > MAX_ZIP_BYTES {
        return Err(JsValue::from_str(&format!(
            "zip exceeds max size ({MAX_ZIP_BYTES} bytes)"
        )));
    }

    Ok(zip_bytes)
}

fn zip_entry_filename(
    entry: &ImageEntry,
    ext: &str,
    index: usize,
    prefix: &str,
    pad: usize,
    preserve_original_names: bool,
    used_names: &mut HashSet<String>,
) -> String {
    let base = if preserve_original_names {
        name_from_original(&entry.name, ext)
    } else {
        format!("{prefix}_{:0pad$}.{ext}", index + 1, pad = pad)
    };
    ensure_unique_zip_name(base, used_names)
}

fn name_from_original(name: &str, ext: &str) -> String {
    let file_name = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(name);
    let stem = file_name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(file_name);
    let stem = sanitize_path_component(stem);
    if stem.is_empty() {
        format!("image.{ext}")
    } else {
        format!("{stem}.{ext}")
    }
}

fn ensure_unique_zip_name(name: String, used_names: &mut HashSet<String>) -> String {
    if used_names.insert(name.clone()) {
        return name;
    }

    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) => (stem.to_string(), ext.to_string()),
        None => (name.clone(), String::new()),
    };

    for n in 2..=9999 {
        let candidate = if ext.is_empty() {
            format!("{stem}-{n}")
        } else {
            format!("{stem}-{n}.{ext}")
        };
        if used_names.insert(candidate.clone()) {
            return candidate;
        }
    }

    let fallback = if ext.is_empty() {
        format!("{stem}-dup")
    } else {
        format!("{stem}-dup.{ext}")
    };
    used_names.insert(fallback.clone());
    fallback
}

fn sanitize_path_component(s: &str) -> String {
    let trimmed = s.trim();
    trimmed
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn sanitize_prefix(prefix: &str) -> String {
    let trimmed = prefix.trim();
    if trimmed.is_empty() {
        return "image".to_string();
    }
    sanitize_path_component(trimmed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_from_original_replaces_extension() {
        assert_eq!(name_from_original("photos/hero.PNG", "webp"), "hero.webp");
    }

    #[test]
    fn ensure_unique_adds_suffix() {
        let mut used = HashSet::new();
        assert_eq!(
            ensure_unique_zip_name("a.webp".to_string(), &mut used),
            "a.webp"
        );
        assert_eq!(
            ensure_unique_zip_name("a.webp".to_string(), &mut used),
            "a-2.webp"
        );
    }
}
