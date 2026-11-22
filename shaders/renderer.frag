#version 300 es

precision highp float;
precision highp int;

${glyph_frag}

#define SAMPLE_MODE 0u

in vec2 v_cell_coord;
in vec2 v_tex_uv_coord; // f_mode == 0

flat in uint f_mode;
flat in vec3 f_fg_colour;
flat in vec3 f_bg_colour;
flat in ivec2 f_glyph_coord;
flat in int f_char_code;

uniform mediump usampler2D u_bitmap_font;
uniform sampler2D u_texture; // f_mode == 0
uniform highp sampler2D u_user_font;
uniform bool u_use_user_font;

out vec4 frag_colour;

void main() {
	vec2 cell_footprint = fwidth(v_cell_coord);

	if (f_mode == SAMPLE_MODE) {
		frag_colour = texture(u_texture, v_tex_uv_coord);
		return;
	}

	vec3 fg = f_fg_colour;
	vec3 bg = f_bg_colour;

	// Codes 176 through 223 use the built-in font.
	if (u_use_user_font && (f_char_code < 176 || f_char_code >= 224)) {
		float value = atlas_glyph_value(
			u_user_font, f_glyph_coord, v_cell_coord, cell_footprint
		);
		frag_colour = vec4(mix(bg, fg, value), 1.0);
		return;
	}

	float value = bitmap_glyph_value(u_bitmap_font, f_glyph_coord,
					 v_cell_coord);
	frag_colour = vec4(mix(bg, fg, value), 1.0);
}
