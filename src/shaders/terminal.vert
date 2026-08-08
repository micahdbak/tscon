#version 300 es

in uint a_colour;
in uint a_char_code;

uniform int u_rows;
uniform int u_cols;
uniform int u_mouse_row;
uniform int u_mouse_col;
uniform vec3 u_palette[16];

out vec2 v_cell_coord;

flat out vec3 f_fg_colour;
flat out vec3 f_bg_colour;
flat out ivec2 f_glyph_coord;

void main() {
	int row = gl_InstanceID / u_cols;
	int col = gl_InstanceID % u_cols;
	int is_cursor = int(u_mouse_row == row && u_mouse_col == col);
	int not_is_cursor = int(is_cursor == 0);

	if (a_colour == 0u && a_char_code == 0u) {
		// clipped: don't cover any pixels below this glyph
		// e.g., a previously rendered texture
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}

	// 240 = 0b11110000
	int colour = int(a_colour + uint(a_colour == 0u) * 240u);

	int fg_idx = int(colour >> (not_is_cursor * 4) & 0xf);
	int bg_idx = int(colour >> (is_cursor * 4) & 0xf);

	f_fg_colour = u_palette[fg_idx];
	f_bg_colour = u_palette[bg_idx];

	// 32 glyph columns, 8 glyph rows
	int glyph_row = int(a_char_code / 32u);
	int glyph_col = int(a_char_code % 32u);

	// coordinate of a_char_code in u_bitmap_font
	f_glyph_coord = ivec2(glyph_col, glyph_row << 2);

	/* A glyph is made up of two triangles, six vertices:
	 *
	 *   0--2     ,5     0--2,5
	 *   | /  +  / |  =  |   |
	 *   1'     3--4    1,3--4
	 */

	int row_inc = int(gl_VertexID == 1 || gl_VertexID == 3 || gl_VertexID == 4);
	int col_inc = int(gl_VertexID == 2 || gl_VertexID == 4 || gl_VertexID == 5);

	v_cell_coord = vec2(float(col_inc), float(row_inc));

	row += row_inc;
	col += col_inc;

	// position needs to be in [-1.0, 1.0]
	float ndc_x = 2.0 * float(col) / float(u_cols) - 1.0;
	float ndc_y = -2.0 * float(row) / float(u_rows) + 1.0;

	gl_Position = vec4(ndc_x, ndc_y, 0.0, 1.0);
}
