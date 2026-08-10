/**
 * Load an image file from `path` into a mipmapped, linearly-filtered WebGL2
 * texture.
 *
 * The image is decoded via an `Image` element, uploaded to the GL context as
 * an `RGBA`/`UNSIGNED_BYTE` texture with premultiplied alpha, and given
 * `LINEAR_MIPMAP_LINEAR` minification and `LINEAR` magnification filtering so
 * it can be sampled at arbitrary sizes by a shader.
 *
 * The returned texture is suitable for use as the `texture` argument of
 * {@link Renderer.draw} (e.g. a photograph, portrait or rendered scene) or
 * as the `canvas.user_font` application-provided font texture.
 *
 * @example
 * ```ts
 * import { Canvas, loadTexture } from "@creat/tscon";
 *
 * const canvas = new Canvas(element);
 * const texture = await loadTexture(canvas.gl, "/images/portrait.jpeg");
 * ```
 *
 * @param gl    The WebGL2 context to create the texture on.
 * @param path  URL/path of the image to load.
 * @returns     A promise that resolves with the created `WebGLTexture` once
 *              the image has been decoded and uploaded.
 */
export function loadTexture(
	gl: WebGL2RenderingContext,
	path: string,
): Promise<WebGLTexture> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.src = path;
		image.onload = () => {
			const tex = gl.createTexture();
			if (!tex) {
				reject(new Error("When creating GL texture"));
				return;
			}

			gl.bindTexture(gl.TEXTURE_2D, tex);

			// prevent texture halos/outlines from filtering
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				image,
			);

			gl.generateMipmap(gl.TEXTURE_2D);

			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MIN_FILTER,
				gl.LINEAR_MIPMAP_LINEAR,
			);

			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MAG_FILTER,
				gl.LINEAR,
			);

			resolve(tex);
		};
	});
}

/**
 * Load six images into a mipmapped cube-map texture.
 *
 * Cube maps are used for environment/skybox rendering. The six faces must be
 * supplied in the standard OpenGL cube-map face order:
 *
 * 1. positive X (right)
 * 2. negative X (left)
 * 3. positive Y (top)
 * 4. negative Y (bottom)
 * 5. positive Z (front)
 * 6. negative Z (back)
 *
 * The resulting texture uses `LINEAR_MIPMAP_LINEAR` / `LINEAR` filtering and is
 * suitable for sampling with `samplerCube` in a shader.
 *
 * @example
 * ```ts
 * import { Canvas, loadCubeMap } from "@creat/tscon";
 *
 * const canvas = new Canvas(element);
 * const skybox = await loadCubeMap(canvas.gl, [
 *   "/images/skybox/right.png",
 *   "/images/skybox/left.png",
 *   "/images/skybox/top.png",
 *   "/images/skybox/bottom.png",
 *   "/images/skybox/front.png",
 *   "/images/skybox/back.png",
 * ]);
 * ```
 *
 * @param gl     The WebGL2 context to create the texture on.
 * @param faces  Exactly six image URLs, one per cube-map face
 *              (see order above).
 * @returns      A promise that resolves with the created cube-map texture.
 * @throws       If `faces` does not contain exactly six entries or the GL
 *              texture cannot be created.
 */
export async function loadCubeMap(
	gl: WebGL2RenderingContext,
	faces: string[],
): Promise<WebGLTexture> {
	if (faces.length !== 6) {
		throw new Error("Cube map requires exactly 6 faces");
	}

	const texture = gl.createTexture();
	if (!texture) {
		throw new Error("When creating cube map texture");
	}

	gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

	const targets = [
		gl.TEXTURE_CUBE_MAP_POSITIVE_X,
		gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
		gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
		gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
		gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
		gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
	];

	const promises = faces.map(async (path, index) => {
		const image = new Promise<HTMLImageElement>(
			(resolve, reject) => {
				const img = new Image();
				img.src = path;
				img.onload = () => resolve(img);
				img.onerror = (err: Event | string) =>
					reject(
						new Error(
							`When loading image at ${path}`,
							{ cause: err },
						),
					);
			},
		);

		const img = await image;
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
		gl.texImage2D(
			targets[index],
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			img,
		);
	});

	await Promise.all(promises);

	gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

	gl.texParameteri(
		gl.TEXTURE_CUBE_MAP,
		gl.TEXTURE_MIN_FILTER,
		gl.LINEAR_MIPMAP_LINEAR,
	);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

	return texture;
}
