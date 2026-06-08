use image::imageops::FilterType as ResizeFilter;
use image::{GenericImageView, ImageBuffer, Rgba};
use imageproc::geometric_transformations::{rotate_about_center, Interpolation};
use wasm_bindgen::prelude::*;

use crate::encode::encode_image_with_format_str;
use crate::target_dimensions;

const MAX_IMAGE_BYTES: usize = 32 * 1024 * 1024;

/// トリム → 回転 → リサイズ → エンコードを一括適用する。
#[wasm_bindgen]
pub fn apply_image_edit(
    buffer: &[u8],
    crop_x: u32,
    crop_y: u32,
    crop_w: u32,
    crop_h: u32,
    rotation_deg: f32,
    output_width: Option<u32>,
    output_height: Option<u32>,
    target_format: &str,
    quality: u8,
) -> Result<Vec<u8>, JsValue> {
    if buffer.len() > MAX_IMAGE_BYTES {
        return Err(JsValue::from_str(&format!(
            "image too large (max {} bytes)",
            MAX_IMAGE_BYTES
        )));
    }

    let quality = quality.clamp(1, 100);
    let img =
        image::load_from_memory(buffer).map_err(|e| JsValue::from_str(&format!("decode: {e}")))?;

    let (src_w, src_h) = img.dimensions();
    validate_crop(src_w, src_h, crop_x, crop_y, crop_w, crop_h)?;

    let cropped = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
    let rotated = rotate_cropped(&cropped, rotation_deg)?;

    let (rot_w, rot_h) = rotated.dimensions();
    let (dst_w, dst_h) = target_dimensions(rot_w, rot_h, output_width, output_height);
    let final_img = if (dst_w, dst_h) != (rot_w, rot_h) {
        rotated.resize(dst_w, dst_h, ResizeFilter::Lanczos3)
    } else {
        rotated
    };

    encode_image_with_format_str(&final_img, target_format, quality)
}

fn validate_crop(
    src_w: u32,
    src_h: u32,
    crop_x: u32,
    crop_y: u32,
    crop_w: u32,
    crop_h: u32,
) -> Result<(), JsValue> {
    if crop_w == 0 || crop_h == 0 {
        return Err(JsValue::from_str("crop size must be greater than 0"));
    }
    if crop_x >= src_w || crop_y >= src_h {
        return Err(JsValue::from_str("crop origin outside image"));
    }
    if crop_x.saturating_add(crop_w) > src_w || crop_y.saturating_add(crop_h) > src_h {
        return Err(JsValue::from_str("crop region exceeds image bounds"));
    }
    Ok(())
}

fn rotate_cropped(
    img: &image::DynamicImage,
    rotation_deg: f32,
) -> Result<image::DynamicImage, JsValue> {
    let normalized = ((rotation_deg % 360.0) + 360.0) % 360.0;
    if normalized < 0.05 || normalized > 359.95 {
        return Ok(img.clone());
    }

    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let rad = normalized.to_radians();
    let sin = rad.sin().abs();
    let cos = rad.cos().abs();
    let new_w = (w as f32 * cos + h as f32 * sin).ceil().max(1.0) as u32;
    let new_h = (w as f32 * sin + h as f32 * cos).ceil().max(1.0) as u32;

    let mut expanded: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_pixel(new_w, new_h, Rgba([0, 0, 0, 0]));
    let ox = ((new_w - w) / 2) as i64;
    let oy = ((new_h - h) / 2) as i64;
    image::imageops::overlay(&mut expanded, &rgba, ox, oy);

    let rotated = rotate_about_center(
        &expanded,
        rad,
        Interpolation::Bilinear,
        Rgba([0, 0, 0, 0]),
    );

    Ok(image::DynamicImage::ImageRgba8(rotated))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    #[test]
    fn crop_and_encode_png() {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_fn(40, 30, |x, y| {
            Rgba([x as u8, y as u8, 128, 255])
        });
        let mut buf = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut buf),
            image::ImageFormat::Png,
        )
        .unwrap();

        let out = apply_image_edit(&buf, 5, 5, 20, 15, 0.0, None, None, "png", 90).unwrap();
        assert!(!out.is_empty());
    }
}
