#version 300 es

in uint a_cell;

uniform int u_rows;
uniform int u_cols;
uniform vec3 u_palette[18];

out vec2 v_cell_coord;

flat out vec3 f_fg_colour;
flat out vec3 f_bg_colour;
flat out ivec2 f_glyph_coord;
flat out uint f_char_code;

void main() {
	int row = gl_InstanceID / u_cols;
	int col = gl_InstanceID % u_cols;

	if (a_cell == 0u) {
		// clipped: don't cover any pixels below this glyph
		// e.g., a previously rendered texture
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}

	uint char_code = a_cell & 0xffu;
	uint bg_idx = (a_cell >> 8u) & 0xffu;
	uint fg_idx = (a_cell >> 16u) & 0xffu;

	f_fg_colour = u_palette[fg_idx < 18u ? fg_idx : 16u];
	f_bg_colour = u_palette[bg_idx < 18u ? bg_idx : 17u];

	// 32 glyph columns, 8 glyph rows.
	f_glyph_coord = ivec2(int(char_code % 32u), int(char_code / 32u));
	f_char_code = char_code;

	/* A glyph is made up of two triangles, six vertices:
	 *
	 *   0--2     ,5     0--2,5
	 *   | /  +  / |  =  |   |
	 *   1'     3--4    1,3--4
	 */

	int row_inc = int(gl_VertexID == 1 || gl_VertexID == 3 ||
			  gl_VertexID == 4);

	int col_inc = int(gl_VertexID == 2 || gl_VertexID == 4 ||
			  gl_VertexID == 5);

	v_cell_coord = vec2(float(col_inc), float(row_inc));

	row += row_inc;
	col += col_inc;

	float ndc_x = 2.0 * float(col) / float(u_cols) - 1.0;
	float ndc_y = -2.0 * float(row) / float(u_rows) + 1.0;

	gl_Position = vec4(ndc_x, ndc_y, 0.0, 1.0);
}
