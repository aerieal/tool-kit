mod batch;
mod color;
mod edit;
mod encode;
mod js_input;
mod placeholder;
mod sprite;
mod svg;

use image::imageops::FilterType as ResizeFilter;
use image::GenericImageView;
use wasm_bindgen::prelude::*;

pub use batch::batch_process_to_zip;
pub use edit::apply_image_edit;
pub use placeholder::generate_placeholder;
pub use sprite::{generate_css_sprite, SpriteSheetResult};
pub use svg::optimize_svg;

#[wasm_bindgen]
pub fn convert_and_resize_image(
    buffer: &[u8],
    target_format: &str,
    quality: u8,
    max_width: Option<u32>,
    max_height: Option<u32>,
) -> Result<Vec<u8>, JsValue> {
    let quality = quality.clamp(1, 100);
    let format = parse_output_format(target_format)?;

    let img =
        image::load_from_memory(buffer).map_err(|e| JsValue::from_str(&format!("decode: {e}")))?;

    let (src_w, src_h) = img.dimensions();
    let (dst_w, dst_h) = target_dimensions(src_w, src_h, max_width, max_height);
    let img = if (dst_w, dst_h) != (src_w, src_h) {
        img.resize(dst_w, dst_h, ResizeFilter::Lanczos3)
    } else {
        img
    };

    encode::encode_image(&img, format, quality)
}

pub(crate) fn parse_output_format(s: &str) -> Result<TargetFormat, JsValue> {
    match s.to_ascii_lowercase().as_str() {
        "webp" => Ok(TargetFormat::WebP),
        "png" => Ok(TargetFormat::Png),
        "jpeg" | "jpg" => Ok(TargetFormat::Jpeg),
        other => Err(JsValue::from_str(&format!(
            "unsupported format: {other} (use webp, png, or jpeg)"
        ))),
    }
}

pub(crate) enum TargetFormat {
    WebP,
    Png,
    Jpeg,
}

pub(crate) fn target_dimensions(
    width: u32,
    height: u32,
    max_width: Option<u32>,
    max_height: Option<u32>,
) -> (u32, u32) {
    if max_width.is_none() && max_height.is_none() {
        return (width, height);
    }

    let mw = max_width.unwrap_or(u32::MAX) as f64;
    let mh = max_height.unwrap_or(u32::MAX) as f64;
    let w = width as f64;
    let h = height as f64;
    let scale = (mw / w).min(mh / h).min(1.0);

    if scale >= 1.0 {
        return (width, height);
    }

    (
        (w * scale).round().max(1.0) as u32,
        (h * scale).round().max(1.0) as u32,
    )
}
