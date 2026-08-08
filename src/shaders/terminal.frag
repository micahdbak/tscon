#version 300 es

precision mediump float;

in vec2 v_cell_coord;

flat in vec3 f_fg_colour;
flat in vec3 f_bg_colour;
flat in ivec2 f_glyph_coord;

uniform mediump usampler2D u_bitmap_font;

out vec4 frag_colour;

// sharp(ish) bilinear filtering helper
vec2 sharp(float coord) {
	float center_dist = fract(coord) - 0.5;
	float sample_pos = floor(coord) + (center_dist - clamp(center_dist, -0.25, 0.25)) * 2.0;
	return vec2(floor(sample_pos), sample_pos - floor(sample_pos));
}

float bit_at(uvec4 texel, int x, int y) {
	return float((texel[y] >> (7 - x)) & 1u);
}

void main() {
	int block = clamp(int(floor(v_cell_coord.y * 4.0)), 0, 3);
	uvec4 texel = texelFetch(u_bitmap_font, ivec2(f_glyph_coord.x, f_glyph_coord.y + block), 0);

	vec2 sharp_x = sharp(v_cell_coord.x * 8.0);
	vec2 sharp_y = sharp(v_cell_coord.y * 16.0 - float(block) * 4.0);

	int x0 = int(clamp(sharp_x.x,       0.0, 7.0));
	int x1 = int(clamp(sharp_x.x + 1.0, 0.0, 7.0));
	int y0 = int(clamp(sharp_y.x,       0.0, 3.0));
	int y1 = int(clamp(sharp_y.x + 1.0, 0.0, 3.0));

	float on = mix(mix(bit_at(texel, x0, y0), bit_at(texel, x1, y0), sharp_x.y),
	           mix(bit_at(texel, x0, y1), bit_at(texel, x1, y1), sharp_x.y), sharp_y.y);

	frag_colour = vec4(mix(f_bg_colour, f_fg_colour, on), 1.0);
}
