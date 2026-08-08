#version 300 es

#define SAMPLE_MODE 0u

precision mediump float;

in vec2 v_cell_coord; // f_mode == 1
in vec2 v_uv_coord;

flat in uint f_mode;
flat in int f_is_cursor;
flat in vec3 f_fg_colour; // f_mode == 1
flat in vec3 f_bg_colour; // f_mode == 1
flat in ivec2 f_glyph_coord; // f_mode == 1

uniform mediump usampler2D u_bitmap_font; // f_mode == 1
uniform sampler2D u_texture;

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
	if (f_mode == SAMPLE_MODE) {
		frag_colour = texture(u_texture, v_uv_coord);

		// invert the sample
		if (f_is_cursor == 1) {
			frag_colour = vec4(vec3(1.0, 1.0, 1.0) - frag_colour.rgb, 1.0);
		}

		return;
	}

	vec3 fg = f_fg_colour;
	vec3 bg = f_bg_colour;

	if (f_is_cursor == 1) {
		vec3 tmp = fg;
		fg = bg;
		bg = tmp;
	}

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

	frag_colour = vec4(mix(bg, fg, on), 1.0);
}
