/**
 * A headless WebGL2 context for tests.
 *
 * All rendering operations are no-ops. Object-creation methods return
 * distinct truthy stand-ins, shader/program status queries report success,
 * attribute locations are `0`, and uniform locations are truthy. That is
 * enough for {@link Canvas}, {@link Terminal}, and {@link Renderer} to build
 * and draw without a GPU.
 *
 * Use {@link createHeadlessGL2} to get a value typed as
 * `WebGL2RenderingContext`.
 *
 * @example
 * ```ts
 * const gl = createHeadlessGL2();
 * const canvas = new Canvas(new TestCanvasHost({
 *   css_width: 800,
 *   css_height: 480,
 * }), gl);
 * ```
 */
export class HeadlessGL2 {
	readonly NO_ERROR = 0;
	readonly COLOR_BUFFER_BIT = 0x4000;
	readonly DEPTH_BUFFER_BIT = 0x0100;
	readonly TRIANGLES = 0x0004;
	readonly POINTS = 0x0000;
	readonly LINES = 0x0001;
	readonly LINE_STRIP = 0x0003;
	readonly TRIANGLE_STRIP = 0x0005;
	readonly TRIANGLE_FAN = 0x0006;

	readonly ARRAY_BUFFER = 0x8892;
	readonly ELEMENT_ARRAY_BUFFER = 0x8893;
	readonly STATIC_DRAW = 0x88e4;
	readonly DYNAMIC_DRAW = 0x88e8;
	readonly STREAM_DRAW = 0x88e0;

	readonly UNSIGNED_BYTE = 0x1401;
	readonly UNSIGNED_SHORT = 0x1403;
	readonly UNSIGNED_INT = 0x1405;
	readonly FLOAT = 0x1406;
	readonly RGBA = 0x1908;
	readonly RGBA8UI = 0x8d7c;
	readonly RGBA_INTEGER = 0x8d99;

	readonly VERTEX_SHADER = 0x8b31;
	readonly FRAGMENT_SHADER = 0x8b30;
	readonly COMPILE_STATUS = 0x8b81;
	readonly LINK_STATUS = 0x8b82;

	readonly TEXTURE_2D = 0x0de1;
	readonly TEXTURE_CUBE_MAP = 0x8513;
	readonly TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515;
	readonly TEXTURE_CUBE_MAP_NEGATIVE_X = 0x8516;
	readonly TEXTURE_CUBE_MAP_POSITIVE_Y = 0x8517;
	readonly TEXTURE_CUBE_MAP_NEGATIVE_Y = 0x8518;
	readonly TEXTURE_CUBE_MAP_POSITIVE_Z = 0x8519;
	readonly TEXTURE_CUBE_MAP_NEGATIVE_Z = 0x851a;
	readonly TEXTURE0 = 0x84c0;
	readonly TEXTURE1 = 0x84c1;
	readonly TEXTURE2 = 0x84c2;
	readonly TEXTURE_MIN_FILTER = 0x2801;
	readonly TEXTURE_MAG_FILTER = 0x2800;
	readonly TEXTURE_WRAP_S = 0x2802;
	readonly TEXTURE_WRAP_T = 0x2803;
	readonly TEXTURE_WRAP_R = 0x8072;
	readonly NEAREST = 0x2600;
	readonly LINEAR = 0x2601;
	readonly LINEAR_MIPMAP_LINEAR = 0x2703;
	readonly CLAMP_TO_EDGE = 0x812f;
	readonly REPEAT = 0x2901;
	readonly UNPACK_ALIGNMENT = 0x0cf5;
	readonly UNPACK_FLIP_Y_WEBGL = 0x9240;
	readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241;

	readonly FRAMEBUFFER = 0x8d40;
	readonly RENDERBUFFER = 0x8d41;
	readonly COLOR_ATTACHMENT0 = 0x8ce0;
	readonly DEPTH_ATTACHMENT = 0x8d00;
	readonly DEPTH_COMPONENT16 = 0x81a5;
	readonly FRAMEBUFFER_COMPLETE = 0x8cd5;
	readonly DEPTH_TEST = 0x0b71;
	readonly LESS = 0x0201;
	readonly LEQUAL = 0x0203;

	readonly MAX_TEXTURE_SIZE = 0x0d33;
	readonly MAX_CUBE_MAP_TEXTURE_SIZE = 0x851c;

	createShader(_type: number): WebGLShader {
		return {} as WebGLShader;
	}

	shaderSource(_shader: WebGLShader, _source: string): void {}

	compileShader(_shader: WebGLShader): void {}

	getShaderParameter(
		_shader: WebGLShader,
		pname: number,
	): boolean | number {
		return pname === this.COMPILE_STATUS ? true : 0;
	}

	getShaderInfoLog(_shader: WebGLShader): string {
		return "";
	}

	getShaderSource(_shader: WebGLShader): string {
		return "";
	}

	deleteShader(_shader: WebGLShader): void {}

	createProgram(): WebGLProgram {
		return {} as WebGLProgram;
	}

	attachShader(_program: WebGLProgram, _shader: WebGLShader): void {}

	bindAttribLocation(
		_program: WebGLProgram,
		_index: number,
		_name: string,
	): void {}

	linkProgram(_program: WebGLProgram): void {}

	getProgramParameter(
		_program: WebGLProgram,
		pname: number,
	): boolean | number {
		return pname === this.LINK_STATUS ? true : 0;
	}

	getProgramInfoLog(_program: WebGLProgram): string {
		return "";
	}

	useProgram(_program: WebGLProgram | null): void {}

	deleteProgram(_program: WebGLProgram): void {}

	createBuffer(): WebGLBuffer {
		return {} as WebGLBuffer;
	}

	bindBuffer(_target: number, _buffer: WebGLBuffer | null): void {}

	bufferData(
		_target: number,
		_src_data: ArrayBufferView | ArrayBuffer | null,
		_usage: number,
	): void {}

	bufferSubData(
		_target: number,
		_offset: number,
		_data: ArrayBufferView | ArrayBuffer,
	): void {}

	deleteBuffer(_buffer: WebGLBuffer): void {}

	createVertexArray(): WebGLVertexArrayObject {
		return {} as WebGLVertexArrayObject;
	}

	bindVertexArray(_array: WebGLVertexArrayObject | null): void {}

	deleteVertexArray(_array: WebGLVertexArrayObject): void {}

	enableVertexAttribArray(_index: number): void {}

	disableVertexAttribArray(_index: number): void {}

	vertexAttribPointer(
		_index: number,
		_size: number,
		_type: number,
		_normalized: boolean,
		_stride: number,
		_offset: number,
	): void {}

	vertexAttribIPointer(
		_index: number,
		_size: number,
		_type: number,
		_stride: number,
		_offset: number,
	): void {}

	vertexAttribDivisor(_index: number, _divisor: number): void {}

	getAttribLocation(
		_program: WebGLProgram,
		_name: string,
	): number {
		return 0;
	}

	getFragDataLocation(
		_program: WebGLProgram,
		_name: string,
	): number {
		return 0;
	}

	getUniformLocation(
		_program: WebGLProgram,
		_name: string,
	): WebGLUniformLocation {
		return {} as WebGLUniformLocation;
	}

	uniform1f(_location: WebGLUniformLocation | null, _x: number): void {}

	uniform1i(_location: WebGLUniformLocation | null, _x: number): void {}

	uniform1fv(
		_location: WebGLUniformLocation | null,
		_value: Float32List,
	): void {}

	uniform2f(
		_location: WebGLUniformLocation | null,
		_x: number,
		_y: number,
	): void {}

	uniform2fv(
		_location: WebGLUniformLocation | null,
		_value: Float32List,
	): void {}

	uniform3f(
		_location: WebGLUniformLocation | null,
		_x: number,
		_y: number,
		_z: number,
	): void {}

	uniform3fv(
		_location: WebGLUniformLocation | null,
		_value: Float32List,
	): void {}

	uniform4f(
		_location: WebGLUniformLocation | null,
		_x: number,
		_y: number,
		_z: number,
		_w: number,
	): void {}

	uniform4fv(
		_location: WebGLUniformLocation | null,
		_value: Float32List,
	): void {}

	uniformMatrix2fv(
		_location: WebGLUniformLocation | null,
		_transpose: boolean,
		_value: Float32List,
	): void {}

	uniformMatrix3fv(
		_location: WebGLUniformLocation | null,
		_transpose: boolean,
		_value: Float32List,
	): void {}

	uniformMatrix4fv(
		_location: WebGLUniformLocation | null,
		_transpose: boolean,
		_value: Float32List,
	): void {}

	createTexture(): WebGLTexture {
		return {} as WebGLTexture;
	}

	activeTexture(_texture: number): void {}

	bindTexture(_target: number, _texture: WebGLTexture | null): void {}

	texImage2D(..._args: unknown[]): void {}

	texSubImage2D(..._args: unknown[]): void {}

	texParameteri(_target: number, _pname: number, _param: number): void {}

	generateMipmap(_target: number): void {}

	pixelStorei(_pname: number, _param: number | boolean): void {}

	deleteTexture(_texture: WebGLTexture): void {}

	createFramebuffer(): WebGLFramebuffer {
		return {} as WebGLFramebuffer;
	}

	bindFramebuffer(
		_target: number,
		_framebuffer: WebGLFramebuffer | null,
	): void {}

	framebufferTexture2D(
		_target: number,
		_attachment: number,
		_textarget: number,
		_texture: WebGLTexture | null,
		_level: number,
	): void {}

	framebufferRenderbuffer(
		_target: number,
		_attachment: number,
		_renderbuffertarget: number,
		_renderbuffer: WebGLRenderbuffer | null,
	): void {}

	checkFramebufferStatus(_target: number): number {
		return this.FRAMEBUFFER_COMPLETE;
	}

	deleteFramebuffer(_framebuffer: WebGLFramebuffer): void {}

	createRenderbuffer(): WebGLRenderbuffer {
		return {} as WebGLRenderbuffer;
	}

	bindRenderbuffer(
		_target: number,
		_renderbuffer: WebGLRenderbuffer | null,
	): void {}

	renderbufferStorage(
		_target: number,
		_internalformat: number,
		_width: number,
		_height: number,
	): void {}

	renderbufferStorageMultisample(
		_target: number,
		_samples: number,
		_internalformat: number,
		_width: number,
		_height: number,
	): void {}

	deleteRenderbuffer(_renderbuffer: WebGLRenderbuffer): void {}

	viewport(
		_x: number,
		_y: number,
		_width: number,
		_height: number,
	): void {}

	clearColor(
		_red: number,
		_green: number,
		_blue: number,
		_alpha: number,
	): void {}

	clear(_mask: number): void {}

	enable(_cap: number): void {}

	disable(_cap: number): void {}

	depthFunc(_func: number): void {}

	drawArrays(
		_mode: number,
		_first: number,
		_count: number,
	): void {}

	drawElements(
		_mode: number,
		_count: number,
		_type: number,
		_offset: number,
	): void {}

	drawArraysInstanced(
		_mode: number,
		_first: number,
		_count: number,
		_instance_count: number,
	): void {}

	drawElementsInstanced(
		_mode: number,
		_count: number,
		_type: number,
		_offset: number,
		_instance_count: number,
	): void {}

	flush(): void {}

	finish(): void {}

	readPixels(..._args: unknown[]): void {}

	getError(): number {
		return this.NO_ERROR;
	}

	isContextLost(): boolean {
		return false;
	}

	getParameter(_pname: number): number {
		return 0;
	}

	getExtension(_name: string): null {
		return null;
	}

	getSupportedExtensions(): string[] {
		return [];
	}

	getContextAttributes(): WebGLContextAttributes {
		return {} as WebGLContextAttributes;
	}
}

/**
 * Create a headless WebGL2 context typed for use with {@link Canvas},
 * {@link Terminal}, and {@link Renderer}.
 *
 * @example
 * ```ts
 * const gl = createHeadlessGL2();
 * const canvas = new Canvas(
 *   new TestCanvasHost({ css_width: 800, css_height: 480 }),
 *   gl,
 * );
 * ```
 *
 * @returns  A no-op `WebGL2RenderingContext`.
 */
export function createHeadlessGL2(): WebGL2RenderingContext {
	return new HeadlessGL2() as unknown as WebGL2RenderingContext;
}
