use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::codecs::webp::WebPEncoder;
use image::{ColorType, DynamicImage, ExtendedColorType, ImageEncoder};
use wasm_bindgen::prelude::*;
use zenwebp::{EncodeRequest, LossyConfig, PixelLayout};

use crate::{parse_output_format, TargetFormat};

pub fn encode_image(
    img: &DynamicImage,
    format: TargetFormat,
    quality: u8,
) -> Result<Vec<u8>, JsValue> {
    let mut out = Vec::new();
    match format {
        TargetFormat::Jpeg => encode_jpeg(img, quality, &mut out)?,
        TargetFormat::Png => encode_png(img, quality, &mut out)?,
        TargetFormat::WebP => encode_webp(img, quality, &mut out)?,
    }
    Ok(out)
}

pub fn encode_image_with_format_str(
    img: &DynamicImage,
    format: &str,
    quality: u8,
) -> Result<Vec<u8>, JsValue> {
    encode_image(img, parse_output_format(format)?, quality)
}

fn encode_jpeg(img: &DynamicImage, quality: u8, out: &mut Vec<u8>) -> Result<(), JsValue> {
    let rgb = img.to_rgb8();
    let (w, h) = rgb.dimensions();
    let mut encoder = JpegEncoder::new_with_quality(out, quality);
    encoder
        .encode(rgb.as_raw(), w, h, ColorType::Rgb8.into())
        .map_err(|e| JsValue::from_str(&format!("jpeg encode: {e}")))?;
    Ok(())
}

fn encode_png(img: &DynamicImage, _quality: u8, out: &mut Vec<u8>) -> Result<(), JsValue> {
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    PngEncoder::new(out)
        .write_image(rgba.as_raw(), w, h, ExtendedColorType::Rgba8)
        .map_err(|e| JsValue::from_str(&format!("png encode: {e}")))?;
    Ok(())
}

fn encode_webp(img: &DynamicImage, quality: u8, out: &mut Vec<u8>) -> Result<(), JsValue> {
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();

    if quality >= 100 {
        let encoder = WebPEncoder::new_lossless(out);
        encoder
            .encode(rgba.as_raw(), w, h, ExtendedColorType::Rgba8)
            .map_err(|e| JsValue::from_str(&format!("webp lossless encode: {e}")))?;
        return Ok(());
    }

    // Default zenwebp tuning (SNS + loop filter + method 4 psycho-visual) can tint or
    // soften colors at higher quality settings. Keep lossy output faithful to input RGB.
    let config = LossyConfig::new()
        .with_quality(quality as f32)
        .with_method(2)
        .with_sns_strength(0)
        .with_filter_strength(0)
        .with_segments(1);
    let webp = EncodeRequest::lossy(&config, rgba.as_raw(), PixelLayout::Rgba8, w, h)
        .encode()
        .map_err(|e| JsValue::from_str(&format!("webp lossy encode: {e}")))?;
    out.extend_from_slice(&webp);
    Ok(())
}

pub fn extension_for_format(format: &str) -> Result<&'static str, JsValue> {
    match parse_output_format(format)? {
        TargetFormat::WebP => Ok("webp"),
        TargetFormat::Png => Ok("png"),
        TargetFormat::Jpeg => Ok("jpg"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TargetFormat;
    use image::{ImageBuffer, Rgba};

    #[test]
    fn webp_lossy_preserves_color_at_high_quality() {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_pixel(64, 64, Rgba([200, 100, 50, 255]));
        let dynamic = DynamicImage::ImageRgba8(img);

        let bytes = encode_image(&dynamic, TargetFormat::WebP, 80).expect("encode webp");
        let decoded = image::load_from_memory(&bytes)
            .expect("decode webp")
            .to_rgba8();
        let center = decoded.get_pixel(32, 32).0;

        for (actual, expected) in center.iter().zip([200u8, 100, 50, 255]) {
            assert!(
                (*actual as i16 - expected as i16).abs() <= 12,
                "channel drift too large: got {center:?}, expected [200, 100, 50, 255]"
            );
        }
    }
}
