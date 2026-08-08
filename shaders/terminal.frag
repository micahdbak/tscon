#version 300 es
#include "glyph.frag"

precision mediump float;

in vec2 v_cell_coord;

flat in vec3 f_fg_colour;
flat in vec3 f_bg_colour;
flat in ivec2 f_glyph_coord;

uniform mediump usampler2D u_bitmap_font;

out vec4 frag_colour;

void main() {
	float value = bitmap_glyph_value(u_bitmap_font, f_glyph_coord, v_cell_coord);
	frag_colour = vec4(mix(f_bg_colour, f_fg_colour, value), 1.0);
}
