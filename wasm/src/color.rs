use image::Rgba;
use wasm_bindgen::prelude::*;

pub fn parse_hex_color(hex: &str) -> Result<Rgba<u8>, JsValue> {
    let s = hex.trim().trim_start_matches('#');
    match s.len() {
        6 => {
            let r = parse_hex_byte(&s[0..2])?;
            let g = parse_hex_byte(&s[2..4])?;
            let b = parse_hex_byte(&s[4..6])?;
            Ok(Rgba([r, g, b, 255]))
        }
        3 => {
            let r = parse_hex_byte(&dup_nibble(&s[0..1]))?;
            let g = parse_hex_byte(&dup_nibble(&s[1..2]))?;
            let b = parse_hex_byte(&dup_nibble(&s[2..3]))?;
            Ok(Rgba([r, g, b, 255]))
        }
        _ => Err(JsValue::from_str(&format!(
            "invalid hex color: {hex} (use #rgb or #rrggbb)"
        ))),
    }
}

fn dup_nibble(one: &str) -> String {
    format!("{one}{one}")
}

fn parse_hex_byte(pair: &str) -> Result<u8, JsValue> {
    u8::from_str_radix(pair, 16).map_err(|_| JsValue::from_str(&format!("invalid hex: {pair}")))
}
