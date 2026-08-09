#version 300 es

precision mediump float;

${glyph_frag}

in vec2 v_cell_coord;
in vec2 v_uv_coord;

flat in vec3 f_fg_colour;
flat in vec3 f_bg_colour;
flat in ivec2 f_glyph_coord;
flat in uint f_char_code;

uniform mediump usampler2D u_bitmap_font;
uniform sampler2D u_user_font;
uniform bool u_use_user_font;

out vec4 frag_colour;

void main() {
	// 176U and 191U are the first and last box-drawing characters
	if (u_use_user_font && (f_char_code < 176U || f_char_code > 191U)) {
		vec4 samp = texture(u_user_font, v_uv_coord);
		frag_colour = vec4(mix(f_bg_colour, f_fg_colour, samp.r), 1.0);
		return;
	}

	float value = bitmap_glyph_value(u_bitmap_font, f_glyph_coord,
					 v_cell_coord);
	frag_colour = vec4(mix(f_bg_colour, f_fg_colour, value), 1.0);
}
