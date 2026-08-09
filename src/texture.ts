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
