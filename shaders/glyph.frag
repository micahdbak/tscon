// Computes the mix value for a coordinate relative to pixels, that will
// snap to the center of the pixel if it is in the center 50% of it, and
// otherwise interpolate linearly outside of the center 50%.
float sharp_bilinear_weight(float coord) {
	// distance of coord to center of cooresponding pixel
	float center_dist = fract(coord) - 0.5;

	// the component of coord that is within 50% of the center of the pixel
	float center_comp = clamp(center_dist, -0.25, 0.25);

	// when center_dist is outside of the center 50% of the pixel, this
	// will be an interpolation between this pixel and its neighbour
	float interp_coord = floor(coord) + (center_dist - center_comp) * 2.0;

	// this will be 0 when coord is in the center 50% of the pixel
	return interp_coord - floor(coord);
}

float bit_value(uvec4 texel, int x, int y) {
	return float((texel[y] >> (7 - x)) & 1u);
}

float bitmap_glyph_value(
	mediump usampler2D bitmap,
	ivec2 glyph_coord,
	vec2 cell_coord
) {
	int block = clamp(int(floor(cell_coord.y * 4.0)), 0, 3);
	ivec2 texel_coord = ivec2(glyph_coord.x, glyph_coord.y + block);
	uvec4 texel = texelFetch(bitmap, texel_coord, 0);

	// each block is 8px wide
	float block_x = clamp(cell_coord.x * 8.0, 0.0, 7.0);

	// each cell is 4 blocks high, each block being 4px tall
	float block_y = clamp(cell_coord.y * 16.0 - float(block) * 4.0,
			      0.0, 3.0);

	float horiz_weight = sharp_bilinear_weight(block_x);
	float vert_weight = sharp_bilinear_weight(block_y);

	int x = clamp(int(block_x), 0, 7);
	int y = clamp(int(block_y), 0, 3);

	// get each bit
	float tl = bit_value(texel, x, y);
	float tr = bit_value(texel, x + 1, y);
	float bl = bit_value(texel, x, y + 1);
	float br = bit_value(texel, x + 1, y + 1);

	float top = mix(tl, tr, horiz_weight);
	float bot = mix(bl, br, horiz_weight);

	return mix(top, bot, vert_weight);
}
