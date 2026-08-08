#version 300 es
#include "glyph.frag"

precision mediump float;

#define SAMPLE_MODE 0u

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

	float value = bitmap_glyph_value(u_bitmap_font, f_glyph_coord, v_cell_coord);
	frag_colour = vec4(mix(bg, fg, value), 1.0);
}
