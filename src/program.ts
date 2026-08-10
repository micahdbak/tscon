/**
 * Compile, link, and return a WebGL2 shader program from GLSL source.
 *
 * Throws with the GL info log if either shader fails to compile or the
 * program fails to link.
 *
 * @example
 * ```ts
 * import { compileProgram } from "@creat/tscon";
 *
 * const program = compileProgram(gl, vertSrc, fragSrc);
 * gl.useProgram(program);
 * ```
 *
 * @param gl               The WebGL2 context.
 * @param vertex_shader    GLSL source for the vertex shader.
 * @param fragment_shader  GLSL source for the fragment shader.
 * @returns                The linked `WebGLProgram`.
 * @throws                 If either shader fails to compile, or the program
 *                         fails to link, with the GL info log in the message.
 */
export function compileProgram(
	gl: WebGL2RenderingContext,
	vertex_shader: string,
	fragment_shader: string,
): WebGLProgram {
	const vert = gl.createShader(gl.VERTEX_SHADER);
	if (!vert) {
		throw new Error("When creating vertex shader");
	}

	gl.shaderSource(vert, vertex_shader);
	gl.compileShader(vert);
	if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
		throw new Error(
			"When compiling vertex shader: " +
				gl.getShaderInfoLog(vert),
		);
	}

	const frag = gl.createShader(gl.FRAGMENT_SHADER);
	if (!frag) {
		throw new Error("When creating fragment shader");
	}

	gl.shaderSource(frag, fragment_shader);
	gl.compileShader(frag);
	if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
		throw new Error(
			"When compiling fragment shader: " +
				gl.getShaderInfoLog(frag),
		);
	}

	const prog = gl.createProgram();
	if (!prog) {
		throw new Error("When creating GPU program");
	}

	gl.attachShader(prog, vert);
	gl.attachShader(prog, frag);
	gl.linkProgram(prog);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
		throw new Error(
			"When linking shader program: " +
				gl.getProgramInfoLog(prog),
		);
	}

	return prog;
}

/**
 * Look up the locations of several vertex attributes at once.
 *
 * `mapping` is a record from an application-defined key to the GLSL attribute
 * name as written in the shader. The returned record maps each key to the
 * attribute's location.
 *
 * @example
 * ```ts
 * import { getAttribLocations } from "@creat/tscon";
 *
 * const attributes = getAttribLocations(gl, program, {
 *   position: "a_position",
 *   normal:   "a_normal",
 *   uv:       "a_uv_coord",
 * });
 * ```
 *
 * @param gl       The WebGL2 context.
 * @param program  The compiled/linked program to query.
 * @param mapping  Key -> GLSL attribute name.
 * @returns        Key -> attribute location.
 * @throws         If any attribute is not found (location < 0).
 */
export function getAttribLocations(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	mapping: Record<string, string>,
): Record<string, number> {
	const attributes: Record<string, number> = {};

	for (const key of Object.keys(mapping)) {
		const name_in_program = mapping[key];
		const location = gl.getAttribLocation(program, name_in_program);

		if (location < 0) {
			throw new Error(
				`When getting attribute location for ${name_in_program}`,
			);
		}

		attributes[key] = location;
	}

	return attributes;
}

/**
 * Look up the locations of several uniforms at once.
 *
 * `mapping` is a record from an application-defined key to the GLSL uniform
 * name as written in the shader. The returned record maps each key to the
 * uniform's `WebGLUniformLocation`.
 *
 * @example
 * ```ts
 * import { getUniformLocations } from "@creat/tscon";
 *
 * const uniforms = getUniformLocations(gl, program, {
 *   projection: "u_projection_matrix",
 *   view:       "u_view_matrix",
 *   model:      "u_model_matrix",
 * });
 * ```
 *
 * @param gl       The WebGL2 context.
 * @param program  The compiled/linked program to query.
 * @param mapping  Key -> GLSL uniform name.
 * @returns        Key -> uniform location.
 * @throws         If any uniform is not found.
 */
export function getUniformLocations(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	mapping: Record<string, string>,
): Record<string, WebGLUniformLocation> {
	const uniforms: Record<string, WebGLUniformLocation> = {};

	for (const key of Object.keys(mapping)) {
		const name_in_program = mapping[key];
		const location = gl.getUniformLocation(
			program,
			name_in_program,
		);

		if (!location) {
			throw new Error(
				`When getting uniform location for ${name_in_program}`,
			);
		}

		uniforms[key] = location;
	}

	return uniforms;
}
