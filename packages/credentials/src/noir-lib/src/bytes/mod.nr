pub fn bytes_as_nibbles<let N: u32>(bytes: [u8; N]) -> [u8; N * 2] {
    let mut nibbles = [0; N * 2];
    for i in 0..N {
        let nibs = byte_to_nibbles(bytes[i]);
        nibbles[i * 2] = nibs.0;
        nibbles[i * 2 + 1] = nibs.1;
    }
    nibbles
}

pub fn byte_to_nibbles(b: u8) -> (u8, u8) {
    let upper = b >> 4;
    let lower = b - 16 * upper;

    (upper, lower)
}
