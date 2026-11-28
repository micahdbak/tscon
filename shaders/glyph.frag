float atlas_sample(highp sampler2D atlas, ivec2 origin, ivec2 size, vec2 position) {
	vec2 texel = clamp(position - 0.5, vec2(0.0), vec2(size - 1));
	ivec2 first = ivec2(texel);
	ivec2 last = min(first + 1, size - 1);
	vec2 weight = fract(texel);
	float top = mix(
		texelFetch(atlas, origin + first, 0).r,
		texelFetch(atlas, origin + ivec2(last.x, first.y), 0).r,
		weight.x
	);
	float bottom = mix(
		texelFetch(atlas, origin + ivec2(first.x, last.y), 0).r,
		texelFetch(atlas, origin + last, 0).r,
		weight.x
	);
	return mix(top, bottom, weight.y);
}

float atlas_glyph_value(
	highp sampler2D atlas,
	ivec2 glyph_coord,
	vec2 cell_coord,
	vec2 cell_footprint
) {
	ivec2 size = textureSize(atlas, 0) / ivec2(32, 8);

	if (any(lessThan(size, ivec2(1)))) {
		return 0.0;
	}

	ivec2 origin = glyph_coord * size;
	vec2 center = cell_coord * vec2(size);
	vec2 footprint = cell_footprint * vec2(size);

	// Bound the sampling cost for large atlases while spreading taps over the pixel.
	ivec2 taps = ivec2(clamp(ceil(footprint), vec2(1.0), vec2(4.0)));
	vec2 step_size = footprint / vec2(taps);
	vec2 start = center - 0.5 * footprint;
	float coverage = 0.0;

	for (int y = 0; y < taps.y; y++) {

		for (int x = 0; x < taps.x; x++) {
			vec2 position = start + (vec2(x, y) + 0.5) * step_size;
			coverage += atlas_sample(atlas, origin, size, position);
		}

	}

	return coverage / float(taps.x * taps.y);
}

float bitmap_glyph_value(
	mediump usampler2D bitmap,
	ivec2 glyph_coord,
	vec2 cell_coord
) {
	ivec2 pixel = clamp(ivec2(cell_coord * vec2(8.0, 16.0)), ivec2(0), ivec2(7, 15));
	ivec2 packed_coord = ivec2(glyph_coord.x, glyph_coord.y * 4 + pixel.y / 4);
	uvec4 rows = texelFetch(bitmap, packed_coord, 0);
	return float((rows[pixel.y % 4] >> (7 - pixel.x)) & 1u);
}
