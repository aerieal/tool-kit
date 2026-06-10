use image::{DynamicImage, Rgba, RgbaImage};
use resvg::tiny_skia::{Pixmap, Transform};
use wasm_bindgen::prelude::*;

use crate::color::parse_hex_color;
use crate::encode::encode_image_with_format_str;
use crate::svg_common::parse_svg_tree;
use crate::target_dimensions;

const MAX_DIMENSION: u32 = 8192;
const MIN_SCALE: f32 = 0.01;
const MAX_SCALE: f32 = 16.0;

#[wasm_bindgen]
pub struct SvgRasterResult {
    data: Vec<u8>,
    width: u32,
    height: u32,
}

#[wasm_bindgen]
impl SvgRasterResult {
    #[wasm_bindgen(getter)]
    pub fn data(&self) -> Vec<u8> {
        self.data.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }
}

/// SVG を PNG / WebP / JPEG にラスタ化する。
/// `scale` は SVG 本来サイズへの倍率。`output_width` / `output_height` 指定時はその範囲内に収まるよう縮小する。
#[wasm_bindgen]
pub fn rasterize_svg(
    input: &str,
    target_format: &str,
    quality: u8,
    scale: f32,
    output_width: Option<u32>,
    output_height: Option<u32>,
    background_color: Option<String>,
) -> Result<SvgRasterResult, JsValue> {
    let quality = quality.clamp(1, 100);
    let scale = scale.clamp(MIN_SCALE, MAX_SCALE);
    let tree = parse_svg_tree(input)?;

    let svg_size = tree.size();
    if svg_size.width() <= 0.0 || svg_size.height() <= 0.0 {
        return Err(JsValue::from_str("SVG has invalid dimensions"));
    }

    let (out_w, out_h) = compute_output_size(
        svg_size.width(),
        svg_size.height(),
        scale,
        output_width,
        output_height,
    )?;

    let sx = out_w as f32 / svg_size.width();
    let sy = out_h as f32 / svg_size.height();
    let transform = Transform::from_scale(sx, sy);

    let mut pixmap = Pixmap::new(out_w, out_h)
        .ok_or_else(|| JsValue::from_str("failed to allocate raster buffer"))?;

    let needs_opaque_bg = target_format.eq_ignore_ascii_case("jpeg")
        || target_format.eq_ignore_ascii_case("jpg")
        || background_color.is_some();

    if needs_opaque_bg {
        let bg_hex = background_color.as_deref().unwrap_or("#ffffff");
        let bg = parse_hex_color(bg_hex)?;
        pixmap.fill(resvg::tiny_skia::Color::from_rgba8(
            bg[0], bg[1], bg[2], 255,
        ));
    }

    resvg::render(&tree, transform, &mut pixmap.as_mut());

    let img = DynamicImage::ImageRgba8(pixmap_to_rgba_image(&pixmap));
    let data = encode_image_with_format_str(&img, target_format, quality)?;

    Ok(SvgRasterResult {
        data,
        width: out_w,
        height: out_h,
    })
}

fn compute_output_size(
    intrinsic_w: f32,
    intrinsic_h: f32,
    scale: f32,
    output_width: Option<u32>,
    output_height: Option<u32>,
) -> Result<(u32, u32), JsValue> {
    let base_w = (intrinsic_w * scale).round().max(1.0) as u32;
    let base_h = (intrinsic_h * scale).round().max(1.0) as u32;

    let (out_w, out_h) = if output_width.is_some() || output_height.is_some() {
        target_dimensions(base_w, base_h, output_width, output_height)
    } else {
        (base_w, base_h)
    };

    if out_w > MAX_DIMENSION || out_h > MAX_DIMENSION {
        return Err(JsValue::from_str(&format!(
            "output dimensions must be <= {MAX_DIMENSION}px"
        )));
    }

    Ok((out_w, out_h))
}

fn pixmap_to_rgba_image(pixmap: &Pixmap) -> RgbaImage {
    let (w, h) = (pixmap.width(), pixmap.height());
    let mut img = RgbaImage::new(w, h);
    let src = pixmap.data();

    for (i, pixel) in img.pixels_mut().enumerate() {
        let j = i * 4;
        let a = src[j + 3];
        if a == 0 {
            *pixel = Rgba([0, 0, 0, 0]);
        } else if a == 255 {
            *pixel = Rgba([src[j], src[j + 1], src[j + 2], 255]);
        } else {
            let alpha = a as f32 / 255.0;
            *pixel = Rgba([
                (src[j] as f32 / alpha).round().clamp(0.0, 255.0) as u8,
                (src[j + 1] as f32 / alpha).round().clamp(0.0, 255.0) as u8,
                (src[j + 2] as f32 / alpha).round().clamp(0.0, 255.0) as u8,
                a,
            ]);
        }
    }

    img
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#336699"/></svg>"##;

    #[test]
    fn rasterize_png() {
        let result = rasterize_svg(SAMPLE, "png", 90, 1.0, None, None, None).unwrap();
        assert_eq!(result.width, 100);
        assert_eq!(result.height, 50);
        assert!(!result.data.is_empty());
    }

    #[test]
    fn rasterize_with_scale() {
        let result = rasterize_svg(SAMPLE, "png", 90, 2.0, None, None, None).unwrap();
        assert_eq!(result.width, 200);
        assert_eq!(result.height, 100);
    }
}
