use ab_glyph::{FontRef, PxScale};
use image::{DynamicImage, RgbaImage};
use imageproc::drawing::{draw_filled_rect_mut, draw_text_mut, text_size};
use imageproc::rect::Rect;
use wasm_bindgen::prelude::*;

use crate::color::parse_hex_color;
use crate::encode::encode_image;
use crate::TargetFormat;

fn parse_placeholder_format(s: &str) -> Result<TargetFormat, JsValue> {
    match s.to_ascii_lowercase().as_str() {
        "webp" => Ok(TargetFormat::WebP),
        "png" => Ok(TargetFormat::Png),
        other => Err(JsValue::from_str(&format!(
            "unsupported format: {other} (use png or webp)"
        ))),
    }
}

const FONT: &[u8] = include_bytes!("../assets/DejaVuSans.ttf");
const MAX_DIMENSION: u32 = 8192;

#[wasm_bindgen]
pub fn generate_placeholder(
    width: u32,
    height: u32,
    bg_color: &str,
    text_color: &str,
    text: Option<String>,
    output_format: &str,
) -> Result<Vec<u8>, JsValue> {
    if width == 0 || height == 0 {
        return Err(JsValue::from_str("width and height must be greater than 0"));
    }
    if width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err(JsValue::from_str(&format!(
            "dimensions must be <= {MAX_DIMENSION}px"
        )));
    }

    let format = parse_placeholder_format(output_format)?;
    let bg = parse_hex_color(bg_color)?;
    let fg = parse_hex_color(text_color)?;
    let label = text.unwrap_or_else(|| format!("{width} x {height}"));

    let font =
        FontRef::try_from_slice(FONT).map_err(|e| JsValue::from_str(&format!("font: {e}")))?;

    let mut canvas = RgbaImage::new(width, height);
    draw_filled_rect_mut(
        &mut canvas,
        Rect::at(0, 0).of_size(width, height),
        bg,
    );

    let scale = fit_text_scale(&font, &label, width, height);
    let (text_w, text_h) = text_size(scale, &font, &label);
    let x = ((width as i32 - text_w as i32) / 2).max(0);
    let y = ((height as i32 - text_h as i32) / 2).max(0);

    draw_text_mut(&mut canvas, fg, x, y, scale, &font, &label);

    let img = DynamicImage::ImageRgba8(canvas);
    // WebP はロッシー品質 90、PNG は品質パラメータ未使用
    let quality = if matches!(format, TargetFormat::WebP) {
        90
    } else {
        100
    };
    encode_image(&img, format, quality)
}

/// テキストが画像の約 90% 以内に収まるようフォントサイズを調整する。
fn fit_text_scale(font: &FontRef, text: &str, width: u32, height: u32) -> PxScale {
    let max_w = width as f32 * 0.9;
    let max_h = height as f32 * 0.9;
    let mut size = (width.min(height) as f32 / 5.0).clamp(10.0, 256.0);

    for _ in 0..200 {
        let scale = PxScale::from(size);
        let (tw, th) = text_size(scale, font, text);
        if (tw as f32) <= max_w && (th as f32) <= max_h {
            return scale;
        }
        size = (size - 1.0).max(8.0);
        if size <= 8.0 {
            return PxScale::from(8.0);
        }
    }

    PxScale::from(8.0)
}
