use js_sys::{Array, Reflect, Uint8Array};
use wasm_bindgen::prelude::*;

pub struct ImageEntry {
    pub name: String,
    pub data: Vec<u8>,
}

const MAX_IMAGES: usize = 128;
const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;

pub fn parse_image_entries(value: &JsValue) -> Result<Vec<ImageEntry>, JsValue> {
    if !value.is_instance_of::<Array>() {
        return Err(JsValue::from_str(
            "expected an array of { name: string, data: Uint8Array }",
        ));
    }

    let array = Array::from(value);
    let len = array.length() as usize;
    if len == 0 {
        return Err(JsValue::from_str("at least one image is required"));
    }
    if len > MAX_IMAGES {
        return Err(JsValue::from_str(&format!("max {MAX_IMAGES} images allowed")));
    }

    let mut entries = Vec::with_capacity(len);
    for i in 0..len {
        let item = array.get(i as u32);
        let name = Reflect::get(&item, &JsValue::from_str("name"))?
            .as_string()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| JsValue::from_str(&format!("images[{i}].name must be a string")))?;

        let data_val = Reflect::get(&item, &JsValue::from_str("data"))?;
        let uint8 = Uint8Array::new(&data_val);
        let byte_len = uint8.length() as usize;
        if byte_len == 0 {
            return Err(JsValue::from_str(&format!("images[{i}].data is empty")));
        }
        if byte_len > MAX_IMAGE_BYTES {
            return Err(JsValue::from_str(&format!(
                "images[{i}] exceeds max size ({MAX_IMAGE_BYTES} bytes)"
            )));
        }

        let mut data = vec![0u8; byte_len];
        uint8.copy_to(&mut data);
        entries.push(ImageEntry { name, data });
    }

    Ok(entries)
}
