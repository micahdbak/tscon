#version 300 es

#define SAMPLE_MODE	0u
#define GLYPHS_MODE	1u
#define BG_GLYPHS_MODE	2u

precision mediump float;

in uint a_row;
in uint a_col;
in uint a_mode;

uniform int u_row;
uniform int u_col;
uniform int u_rows;
uniform int u_cols;
uniform int u_canvas_rows;
uniform int u_canvas_cols;
uniform int u_mouse_row;
uniform int u_mouse_col;
uniform vec3 u_palette[16];
uniform sampler2D u_texture;

out vec2 v_cell_coord; // f_mode > 0
out vec2 v_uv_coord;

flat out uint f_mode;
flat out int f_is_cursor;
flat out vec3 f_fg_colour; // f_mode > 0
flat out vec3 f_bg_colour; // f_mode > 0
flat out ivec2 f_glyph_coord; // f_mode > 0

const vec3 dimensions[8] = vec3[](
	vec3(0.0, 0.0, 0.0),	// black (unused)
	vec3(1.0, 0.8, 0.8),	// red
	vec3(0.8, 1.0, 0.8),	// green
	vec3(1.0, 1.0, 0.8),	// yellow
	vec3(0.8, 0.8, 1.0),	// blue
	vec3(1.0, 0.8, 1.0),	// magenta
	vec3(0.8, 1.0, 1.0),	// cyan
	vec3(1.0, 1.0, 1.0)	// white
);

struct Dims {
	int dim1;
	int dim2;
	float ratio;
};

Dims getDims(vec3 colour) {
	vec3 ncolour = normalize(colour);
	float d1 = 1000.0;
	float d2 = 1000.0;
	int dim1 = 0;
	int dim2 = 0;

	for (int i = 1; i < 8; i++) {
		float d = distance(ncolour, normalize(dimensions[i]));

		if (d < d1) {
			d2 = d1;
			dim2 = dim1;
			d1 = d;
			dim1 = i;
		} else if (d < d2) {
			d2 = d;
			dim2 = i;
		}
	}

	return Dims(dim1, dim2, d1 / (d1 + d2));
}

float getLum(vec3 colour, int dim) {
	vec3 dcolour = dimensions[dim];
	return dot(colour, dcolour) / dot(dcolour, dcolour);
}

struct Glyph {
	int char_code;
	int fg_idx;
	int bg_idx;
};

Glyph getGlyph(int dim, float lum) {
	//                        .   ,   -   :   ;   =   !   *   #   $   @
	int glyphs[12] = int[](0, 46, 44, 45, 58, 59, 61, 33, 42, 35, 36, 64);

	int fgs[2] = int[](dim, dim + 8);

	if (dim == 7) {
		fgs = int[](8, 15);
	}

	int layer = clamp(int(lum * 2.0), 0, 2);

	Glyph glyph;

	int glyph_idx = clamp(int(12.0 * lum), 0, 11);
	glyph.char_code = glyphs[glyph_idx];
	glyph.fg_idx = fgs[layer];
	glyph.bg_idx = 0;

	return glyph;
}

Glyph getBgGlyph(int dim, float lum) {
	//                        .   -   ,   :   ;   =   !   *   #   $   @
	int glyphs[12] = int[](0, 46, 45, 44, 58, 59, 61, 33, 42, 35, 36, 64);

	int fgs[3] = int[](dim, dim + 8, 15);
	int bgs[3] = int[](0, dim, dim + 8);

	int layer = clamp(int(lum * 3.0), 0, 2);

	// check if dimension is white
	if (dim == 7) {
		if (layer > 0) {
			// reverse the order of the glyphs
			glyphs = int[](64, 36, 35, 42, 33, 61, 59, 58, 44, 45, 46, 0);
		}

		fgs = int[](7, 0, 8);
		bgs = int[](0, 7, 15);
	}

	Glyph glyph;

	int glyph_idx = clamp(int(12.0 * (3.0 * lum - float(layer))), 0, 11);
	glyph.char_code = glyphs[glyph_idx];
	glyph.fg_idx = fgs[layer];
	glyph.bg_idx = bgs[layer];

	return glyph;
}

void main() {
	int origin_row = int(a_row);
	int origin_col = int(a_col);

	f_is_cursor = int(origin_row + u_row == u_mouse_row && origin_col + u_col == u_mouse_col);

	/* A glyph is made up of two triangles, six vertices:
	 *
	 *   0--2     ,5     0--2,5
	 *   | /  +  / |  =  |   |
	 *   1'     3--4    1,3--4
	 */

	int row_inc = int(gl_VertexID == 1 || gl_VertexID == 3 || gl_VertexID == 4);
	int col_inc = int(gl_VertexID == 2 || gl_VertexID == 4 || gl_VertexID == 5);

	v_cell_coord = vec2(float(col_inc), float(row_inc));

	int row = origin_row + row_inc;
	int col = origin_col + col_inc;

	v_uv_coord = vec2(float(col) / float(u_cols), float(row) / float(u_rows));

	// position needs to be in [-1.0, 1.0]
	float ndc_x = 2.0 * float(u_col + col) / float(u_canvas_cols) - 1.0;
	float ndc_y = -2.0 * float(u_row + row) / float(u_canvas_rows) + 1.0;

	gl_Position = vec4(ndc_x, ndc_y, 0.0, 1.0);

	f_mode = a_mode;

	// sample mode
	if (f_mode == SAMPLE_MODE) {
		// no more work to do
		return;
	}

	// dithered glyphs mode

	vec2 origin_uv_coord = vec2(float(origin_col) / float(u_cols), float(origin_row) / float(u_rows));

	vec2 full_uv_cell = vec2(1.0 / float(u_cols), 1.0 / float(u_rows));
	/*
	// sample across cell's texel using mipmaps when available
	vec2 br = origin_uv_coord + full_uv_cell; // bottom-right uv coord of cell
	vec4 samp = textureGrad(u_texture,
		origin_uv_coord + 0.5 * full_uv_cell,
		vec2(br.x - origin_uv_coord.x, 0.0),
		vec2(0.0, br.y - origin_uv_coord.y));
	vec3 colour = samp.rgb;
	*/
	vec4 samp = texture(u_texture, origin_uv_coord + 0.5 * full_uv_cell);
	vec3 colour = samp.rgb;

	// dithering
	float bayer[16] = float[](
		0.0, 0.5, 0.125, 0.625,
		0.75, 0.25, 0.875, 0.375,
		0.1875, 0.6875, 0.0625, 0.5625,
		0.9375, 0.4375, 0.8125, 0.3125
	);
	float bayer_val = bayer[int(origin_row) % 4 * 4 + int(origin_col) % 4];

	Dims dims = getDims(colour);
	int dim = (bayer_val < dims.ratio) ? dims.dim2 : dims.dim1;
	float lum = getLum(colour, dim);

	float dither = (bayer_val - 0.5) / 12.0;
	lum = clamp(lum + dither, 0.0, 1.0);

	Glyph glyph;

	if (f_mode == BG_GLYPHS_MODE) {
		glyph = getBgGlyph(dim, lum);
	} else {
		glyph = getGlyph(dim, lum);
	}

	if (glyph.fg_idx == glyph.bg_idx && f_is_cursor == 1) {
		glyph.fg_idx = 15;
		glyph.bg_idx = 0;
	}

	f_fg_colour = u_palette[glyph.fg_idx];
	f_bg_colour = u_palette[glyph.bg_idx];

	// 32 glyph columns, 8 glyph rows
	int glyph_row = int(glyph.char_code / 32);
	int glyph_col = int(glyph.char_code % 32);

	// coordinate of char_code in u_bitmap_font
	f_glyph_coord = ivec2(glyph_col, glyph_row << 2);
}
