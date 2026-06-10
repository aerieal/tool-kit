use usvg::{Indent, WriteOptions};
use wasm_bindgen::prelude::*;

use crate::svg_common::parse_svg_tree;

/// SVG（XML テキスト）をパース・正規化し、ミニファイした SVG 文字列を返す。
#[wasm_bindgen]
pub fn optimize_svg(input: &str) -> Result<String, JsValue> {
    let tree = parse_svg_tree(input)?;

    let write_opts = WriteOptions {
        preserve_text: true,
        coordinates_precision: 2,
        transforms_precision: 3,
        use_single_quote: false,
        indent: Indent::None,
        attributes_indent: Indent::None,
        ..WriteOptions::default()
    };

    Ok(tree.to_string(&write_opts))
}
