use dep::std::wrapping_sub;

pub global RLP_DATA_TYPE_STRING = 0;
pub global RLP_DATA_TYPE_LIST = 1;

pub struct RlpFragment {
    pub offset: u32,
    pub length: u32,
    pub data_type: u32,
}

pub unconstrained fn decode_rlp_list_fragments<let NODE_LEN: u32, let MAX_FIELDS: u32>(
    rlp_header: RlpFragment,
    node: [u8; NODE_LEN],
) -> BoundedVec<RlpFragment, MAX_FIELDS> {
    let node_len = rlp_header.length + rlp_header.offset;
    let mut rlp_list = BoundedVec::new();
    let mut curr_offset = rlp_header.offset;
    for _ in 0..MAX_FIELDS {
        if (curr_offset < node_len) {
            let field_prefix = node[curr_offset];

            let field_offset = if field_prefix < 0x80 { 0 } else { 1 };
            let field_length = if field_prefix < 0x80 {
                1
            } else {
                wrapping_sub(field_prefix as u32, 0x80)
            };

            rlp_list.push(
                RlpFragment {
                    offset: curr_offset + field_offset,
                    length: field_length,
                    data_type: RLP_DATA_TYPE_STRING,
                },
            );

            curr_offset += field_length + field_offset;
        }
    }

    rlp_list
}

pub unconstrained fn decode_rlp_header<let NODE_LEN: u32>(node: [u8; NODE_LEN]) -> RlpFragment {
    let (prefix, data) = node.as_slice().pop_front();

    if (prefix < 0x80) {
        // 1 byte
        RlpFragment { offset: 0 as u32, length: 1 as u32, data_type: RLP_DATA_TYPE_STRING }
    } else if (prefix < 0xb8) {
        // 0-55 byte string
        RlpFragment {
            offset: 1,
            length: wrapping_sub(prefix, 0x80) as u32,
            data_type: RLP_DATA_TYPE_STRING,
        }
    } else if (prefix < 0xc0) {
        // > 55 byte string
        RlpFragment {
            offset: wrapping_sub(1 + prefix, 0xb7) as u32,
            length: extract_payload_len(data, wrapping_sub(prefix, 0xb7) as u32),
            data_type: RLP_DATA_TYPE_STRING,
        }
    } else if (prefix < 0xf8) {
        // 0-55 byte array
        RlpFragment {
            offset: 1,
            length: wrapping_sub(prefix, 0xc0) as u32,
            data_type: RLP_DATA_TYPE_LIST,
        }
    } else {
        // > 55 byte array
        RlpFragment {
            offset: wrapping_sub(1 + prefix, 0xf7) as u32,
            length: extract_payload_len(data, wrapping_sub(prefix, 0xf7) as u32),
            data_type: RLP_DATA_TYPE_LIST,
        }
    }
}

fn extract_payload_len(data: [u8], len: u32) -> u32 {
    let data_len = data.len();
    let mut node_len = 0;
    for i in 0..2 {
        if (i < len & i < data_len) {
            node_len = data[i] as u32 + node_len * 256;
        }
    }

    node_len
}

pub fn encode_rlp_string<let N: u32>(data: [u8; N]) -> [u8; N] {
    let length = data.len();
    let mut result = [0; N];

    // Find first non-zero byte using for loop
    let mut start_idx = 0;
    for i in 0..N {
        if (start_idx == 0) & (data[i] != 0) {
            start_idx = i;
        }
    }

    // If all zeros, return single zero byte
    if (start_idx == 0) & (data[0] == 0) {
        result[0] = 0x80;
        result
    }

    let actual_length = length - start_idx;

    if (actual_length == 1) & (data[start_idx] < 0x80) {
        // Single byte < 0x80
        result[0] = data[start_idx];
    } else {
        // 0-55 bytes string
        result[0] = (0x80 + actual_length) as u8;
        for i in 0..N {
            if i < actual_length {
                result[i + 1] = data[start_idx + i];
            }
        }
    }

    result
}
