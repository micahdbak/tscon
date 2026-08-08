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
			"When compiling vertex shader: " + gl.getShaderInfoLog(vert),
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
			"When compiling fragment shader: " + gl.getShaderInfoLog(frag),
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
			"When linking shader program: " + gl.getProgramInfoLog(prog),
		);
	}

	return prog;
}

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
			throw new Error(`When getting attribute location for ${name_in_program}`);
		}

		attributes[key] = location;
	}

	return attributes;
}

export function getUniformLocations(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	mapping: Record<string, string>,
): Record<string, WebGLUniformLocation> {
	const uniforms: Record<string, WebGLUniformLocation> = {};

	for (const key of Object.keys(mapping)) {
		const name_in_program = mapping[key];
		const location = gl.getUniformLocation(program, name_in_program);

		if (!location) {
			throw new Error(`When getting uniform location for ${name_in_program}`);
		}

		uniforms[key] = location;
	}

	return uniforms;
}
