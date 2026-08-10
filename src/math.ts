/**
 * A column-major 4x4 matrix stored as a 16-element `Float32Array`.
 *
 * `Mat4` provides static helpers for creating and operating on 4x4 matrices
 * following the conventions of `gl-matrix`-style libraries: the `o` argument
 * of each operation is the output buffer (which may alias an input) and the
 * same buffer is returned to allow chaining.
 *
 * Matrices are stored column-major; element `m[col * 4 + row]` is row `row`,
 * column `col`.
 */
export class Mat4 {
	/**
	 * Create and return a new 4x4 identity matrix.
	 *
	 * @returns A 16-element `Float32Array` initialised to the identity
	 *          matrix.
	 */
	static create(): Float32Array {
		const o = new Float32Array(16);
		o[0] = 1;
		o[5] = 1;
		o[10] = 1;
		o[15] = 1;
		return o;
	}

	/**
	 * Set all 16 components of matrix `o` to the given values, which are
	 * supplied in column-major order (`m00, m01, m02, m03, m10, ...`).
	 *
	 * `o` is returned for convenience.
	 *
	 * @param o  The matrix to write into.
	 * @returns  The same matrix `o`, with its components overwritten.
	 */
	static set(
		o: Float32Array,
		m00: number,
		m01: number,
		m02: number,
		m03: number,
		m10: number,
		m11: number,
		m12: number,
		m13: number,
		m20: number,
		m21: number,
		m22: number,
		m23: number,
		m30: number,
		m31: number,
		m32: number,
		m33: number,
	): Float32Array {
		o[0] = m00;
		o[1] = m01;
		o[2] = m02;
		o[3] = m03;
		o[4] = m10;
		o[5] = m11;
		o[6] = m12;
		o[7] = m13;
		o[8] = m20;
		o[9] = m21;
		o[10] = m22;
		o[11] = m23;
		o[12] = m30;
		o[13] = m31;
		o[14] = m32;
		o[15] = m33;
		return o;
	}

	/**
	 * Multiply matrices `a` and `b` and store the result in `o`
	 * (`o = a * b`).
	 *
	 * `o` may be the same buffer as `a` or `b`. The result is equivalent to
	 * first applying `b` then `a` (i.e. `a * b` in standard column-vector
	 * notation), which is the order used for building model/view/projection
	 * chains.
	 *
	 * @param o  Output matrix (may alias `a` or `b`).
	 * @param a  Left-hand matrix.
	 * @param b  Right-hand matrix.
	 * @returns  The matrix `o`.
	 */
	static multiply(
		o: Float32Array,
		a: Float32Array,
		b: Float32Array,
	): Float32Array {
		const a00 = a[0],
			a01 = a[1],
			a02 = a[2],
			a03 = a[3];
		const a10 = a[4],
			a11 = a[5],
			a12 = a[6],
			a13 = a[7];
		const a20 = a[8],
			a21 = a[9],
			a22 = a[10],
			a23 = a[11];
		const a30 = a[12],
			a31 = a[13],
			a32 = a[14],
			a33 = a[15];
		let b0 = b[0],
			b1 = b[1],
			b2 = b[2],
			b3 = b[3];
		o[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
		o[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
		o[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
		o[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
		b0 = b[4];
		b1 = b[5];
		b2 = b[6];
		b3 = b[7];
		o[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
		o[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
		o[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
		o[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
		b0 = b[8];
		b1 = b[9];
		b2 = b[10];
		b3 = b[11];
		o[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
		o[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
		o[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
		o[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
		b0 = b[12];
		b1 = b[13];
		b2 = b[14];
		b3 = b[15];
		o[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
		o[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
		o[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
		o[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
		return o;
	}

	/**
	 * Set `o` to the transpose of `a`.
	 *
	 * `o` may be the same buffer as `a`; in that case the transpose is
	 * performed in place.
	 *
	 * @param o  Output matrix (may alias `a`).
	 * @param a  Source matrix.
	 * @returns  The matrix `o`.
	 */
	static transpose(o: Float32Array, a: Float32Array): Float32Array {
		if (o === a) {
			// in-place transpose
			const a01 = a[1],
				a02 = a[2],
				a03 = a[3];
			const a12 = a[6],
				a13 = a[7];
			const a23 = a[11];
			o[1] = a[4];
			o[2] = a[8];
			o[3] = a[12];
			o[4] = a01;
			o[6] = a[9];
			o[7] = a[13];
			o[8] = a02;
			o[9] = a12;
			o[11] = a[14];
			o[12] = a03;
			o[13] = a13;
			o[14] = a23;
		} else {
			o[0] = a[0];
			o[1] = a[4];
			o[2] = a[8];
			o[3] = a[12];
			o[4] = a[1];
			o[5] = a[5];
			o[6] = a[9];
			o[7] = a[13];
			o[8] = a[2];
			o[9] = a[6];
			o[10] = a[10];
			o[11] = a[14];
			o[12] = a[3];
			o[13] = a[7];
			o[14] = a[11];
			o[15] = a[15];
		}
		return o;
	}

	/**
	 * Set `o` to the inverse of `a`.
	 *
	 * The determinant is computed internally; if it is zero the resulting
	 * matrix is undefined. `o` must not alias `a` (the computation
	 * reads `a` while writing `o`).
	 *
	 * @param o  Output matrix (must not alias `a`).
	 * @param a  Source matrix.
	 * @returns  The matrix `o`.
	 */
	static inverse(o: Float32Array, a: Float32Array): Float32Array {
		const a00 = a[0],
			a01 = a[1],
			a02 = a[2],
			a03 = a[3];
		const a10 = a[4],
			a11 = a[5],
			a12 = a[6],
			a13 = a[7];
		const a20 = a[8],
			a21 = a[9],
			a22 = a[10],
			a23 = a[11];
		const a30 = a[12],
			a31 = a[13],
			a32 = a[14],
			a33 = a[15];
		const b00 = a00 * a11 - a01 * a10;
		const b01 = a00 * a12 - a02 * a10;
		const b02 = a00 * a13 - a03 * a10;
		const b03 = a01 * a12 - a02 * a11;
		const b04 = a01 * a13 - a03 * a11;
		const b05 = a02 * a13 - a03 * a12;
		const b06 = a20 * a31 - a21 * a30;
		const b07 = a20 * a32 - a22 * a30;
		const b08 = a20 * a33 - a23 * a30;
		const b09 = a21 * a32 - a22 * a31;
		const b10 = a21 * a33 - a23 * a31;
		const b11 = a22 * a33 - a23 * a32;
		const det = 1.0 /
			(b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 -
				b04 * b07 + b05 * b06);
		o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
		o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
		o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
		o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
		o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
		o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
		o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
		o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
		o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
		o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
		o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
		o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
		o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
		o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
		o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
		o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
		return o;
	}

	/**
	 * Compute the upper-left 3x3 inverse-transpose of `a` and write it into
	 * the 9-element output `o`.
	 *
	 * This is the standard "normal matrix" used to transform normals in a
	 * lighting shader. `o` must be a `Float32Array` of length 9 and
	 * must not alias `a`.
	 *
	 * @example
	 * ```ts
	 * import { Mat4 } from "@creat/tscon";
	 *
	 * const mv = Mat4.create();
	 * Mat4.multiply(mv, view, model);
	 * const normals = new Float32Array(9);
	 * Mat4.inverseTranspose3x3(normals, mv);
	 * gl.uniformMatrix3fv(loc, false, normals);
	 * ```
	 *
	 * @param o  Output 3x3 matrix (length-9 `Float32Array`).
	 * @param a  Source 4x4 matrix.
	 * @returns  The matrix `o`.
	 */
	static inverseTranspose3x3(
		o: Float32Array,
		a: Float32Array,
	): Float32Array {
		const a00 = a[0],
			a01 = a[1],
			a02 = a[2],
			a03 = a[3];
		const a10 = a[4],
			a11 = a[5],
			a12 = a[6],
			a13 = a[7];
		const a20 = a[8],
			a21 = a[9],
			a22 = a[10],
			a23 = a[11];
		const a30 = a[12],
			a31 = a[13],
			a32 = a[14],
			a33 = a[15];
		const b00 = a00 * a11 - a01 * a10;
		const b01 = a00 * a12 - a02 * a10;
		const b02 = a00 * a13 - a03 * a10;
		const b03 = a01 * a12 - a02 * a11;
		const b04 = a01 * a13 - a03 * a11;
		const b05 = a02 * a13 - a03 * a12;
		const b06 = a20 * a31 - a21 * a30;
		const b07 = a20 * a32 - a22 * a30;
		const b08 = a20 * a33 - a23 * a30;
		const b09 = a21 * a32 - a22 * a31;
		const b10 = a21 * a33 - a23 * a31;
		const b11 = a22 * a33 - a23 * a32;
		const det = 1.0 /
			(b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 -
				b04 * b07 + b05 * b06);
		o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
		o[1] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
		o[2] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
		o[3] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
		o[4] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
		o[5] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
		o[6] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
		o[7] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
		o[8] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
		return o;
	}

	/**
	 * Set `o` to a perspective projection matrix.
	 *
	 * The matrix maps a view frustum defined by a vertical field of view
	 * `fovy` (in radians), the viewport `aspect` ratio (width /
	 * height), and the `near` and `far` clip-plane distances into clip
	 * space, with the camera looking down -Z.
	 *
	 * @param o       Output matrix.
	 * @param fovy    Vertical field of view, in radians.
	 * @param aspect  Width / height of the viewport.
	 * @param near    Distance to the near clip plane.
	 * @param far     Distance to the far clip plane.
	 * @returns       The matrix `o`.
	 */
	static perspective(
		o: Float32Array,
		fovy: number,
		aspect: number,
		near: number,
		far: number,
	): Float32Array {
		const f = 1.0 / Math.tan(fovy / 2.0);
		o[0] = f / aspect;
		o[1] = 0;
		o[2] = 0;
		o[3] = 0;
		o[4] = 0;
		o[5] = f;
		o[6] = 0;
		o[7] = 0;
		o[8] = 0;
		o[9] = 0;
		o[11] = -1;
		o[12] = 0;
		o[13] = 0;
		o[15] = 0;
		const nf = 1 / (near - far);
		o[10] = (far + near) * nf;
		o[14] = 2 * far * near * nf;
		return o;
	}

	/**
	 * Set `o` to an orthographic projection matrix.
	 *
	 * The matrix maps the axis-aligned box with the given left/right,
	 * bottom/top, and near/far planes into clip space.
	 *
	 * @param o      Output matrix.
	 * @param left   Left edge of the view volume.
	 * @param right  Right edge of the view volume.
	 * @param bottom Bottom edge of the view volume.
	 * @param top    Top edge of the view volume.
	 * @param near   Distance to the near clip plane.
	 * @param far    Distance to the far clip plane.
	 * @returns      The matrix `o`.
	 */
	static orthographic(
		o: Float32Array,
		left: number,
		right: number,
		bottom: number,
		top: number,
		near: number,
		far: number,
	): Float32Array {
		o[0] = 2 / (right - left);
		o[1] = 0;
		o[2] = 0;
		o[3] = 0;
		o[4] = 0;
		o[5] = 2 / (top - bottom);
		o[6] = 0;
		o[7] = 0;
		o[8] = 0;
		o[9] = 0;
		o[10] = -2 / (far - near);
		o[11] = 0;
		o[12] = -(right + left) / (right - left);
		o[13] = -(top + bottom) / (top - bottom);
		o[14] = -(far + near) / (far - near);
		o[15] = 1;
		return o;
	}

	/**
	 * Set `o` to a "look at" view matrix.
	 *
	 * Builds a camera/view matrix placed at `eye`, oriented to look towards
	 * `center`, with the given `up` axis. The result transforms world-space
	 * coordinates into view space (camera looking down -Z).
	 *
	 * @param o       Output matrix.
	 * @param eye     Camera position as a length-3 array `[x, y, z]`.
	 * @param center  Point the camera looks towards, `[x, y, z]`.
	 * @param up      Camera up direction, `[x, y, z]`.
	 * @returns       The matrix `o`.
	 */
	static lookAt(
		o: Float32Array,
		e: Float32Array,
		c: Float32Array,
		up: Float32Array,
	): Float32Array {
		let x0: number,
			x1: number,
			x2: number,
			y0: number,
			y1: number,
			y2: number,
			z0: number,
			z1: number,
			z2: number,
			l: number;
		z0 = e[0] - c[0];
		z1 = e[1] - c[1];
		z2 = e[2] - c[2];
		l = 1 / Math.hypot(z0, z1, z2);
		z0 *= l;
		z1 *= l;
		z2 *= l;
		x0 = up[1] * z2 - up[2] * z1;
		x1 = up[2] * z0 - up[0] * z2;
		x2 = up[0] * z1 - up[1] * z0;
		l = 1 / Math.hypot(x0, x1, x2);
		x0 *= l;
		x1 *= l;
		x2 *= l;
		y0 = z1 * x2 - z2 * x1;
		y1 = z2 * x0 - z0 * x2;
		y2 = z0 * x1 - z1 * x0;
		l = 1 / Math.hypot(y0, y1, y2);
		y0 *= l;
		y1 *= l;
		y2 *= l;
		o[0] = x0;
		o[1] = y0;
		o[2] = z0;
		o[3] = 0;
		o[4] = x1;
		o[5] = y1;
		o[6] = z1;
		o[7] = 0;
		o[8] = x2;
		o[9] = y2;
		o[10] = z2;
		o[11] = 0;
		o[12] = -(x0 * e[0] + x1 * e[1] + x2 * e[2]);
		o[13] = -(y0 * e[0] + y1 * e[1] + y2 * e[2]);
		o[14] = -(z0 * e[0] + z1 * e[1] + z2 * e[2]);
		o[15] = 1;
		return o;
	}

	/**
	 * Create and return a translation matrix for the given offsets.
	 *
	 * @param tx  Translation along X.
	 * @param ty  Translation along Y.
	 * @param tz  Translation along Z.
	 * @returns   A new translation matrix.
	 */
	static translation(tx: number, ty: number, tz: number): Float32Array {
		const m = Mat4.create();

		// deno-fmt-ignore
		Mat4.set(m,
			 1, 0, 0, 0,
			 0, 1, 0, 0,
			 0, 0, 1, 0,
			 tx, ty, tz, 1);

		return m;
	}

	/**
	 * Create and return a non-uniform scale matrix.
	 *
	 * @param sx  Scale factor along X.
	 * @param sy  Scale factor along Y.
	 * @param sz  Scale factor along Z.
	 * @returns   A new scale matrix.
	 */
	static scale(sx: number, sy: number, sz: number): Float32Array {
		const m = Mat4.create();

		// deno-fmt-ignore
		Mat4.set(m,
			 sx, 0, 0, 0,
			 0, sy, 0, 0,
			 0, 0, sz, 0,
			 0, 0, 0, 1);

		return m;
	}

	/**
	 * Create and return a rotation matrix.
	 *
	 * The rotation is by `radians` about one of the principal axes. The
	 * returned matrix follows a right-handed convention.
	 *
	 * @param axis     The axis to rotate about: `"x"`, `"y"`, or `"z"`.
	 * @param radians  Rotation angle in radians.
	 * @returns        A new rotation matrix, or an identity matrix if
	 *                `axis` is not recognised.
	 */
	static rotation(axis: string, radians: number): Float32Array {
		const c = Math.cos(radians);
		const s = Math.sin(radians);
		const m = Mat4.create();

		switch (axis) {
			case "x":
				// deno-fmt-ignore
				Mat4.set(m,
					 1, 0, 0, 0,
					 0, c, s, 0,
					 0, -s, c, 0,
					 0, 0, 0, 1);

				break;

			case "y":
				// deno-fmt-ignore
				Mat4.set(m,
					 c, 0, -s, 0,
					 0, 1, 0, 0,
					 s, 0, c, 0,
					 0, 0, 0, 1);

				break;

			case "z":
				// deno-fmt-ignore
				Mat4.set(m,
					 c, s, 0, 0,
					 -s, c, 0, 0,
					 0, 0, 1, 0,
					 0, 0, 0, 1);

				break;
		}

		return m;
	}
}

/**
 * A 4-component vector stored as a 4-element `Float32Array`.
 *
 * Like {@link Mat4}, `Vec4` exposes static helpers that take an output buffer
 * `o` (returned for chaining) rather than allocating on each operation.
 */
export class Vec4 {
	/**
	 * Create and return a new zeroed 4-component vector.
	 *
	 * @returns A length-4 `Float32Array` initialised to `[0, 0, 0, 0]`.
	 */
	static create(): Float32Array {
		return new Float32Array(4);
	}

	/**
	 * Set the four components of vector `o` to the given values.
	 *
	 * @param o  The vector to write into.
	 * @param x  Component 0.
	 * @param y  Component 1.
	 * @param z  Component 2.
	 * @param w  Component 3.
	 */
	static set(
		o: Float32Array,
		x: number,
		y: number,
		z: number,
		w: number,
	): void {
		o[0] = x;
		o[1] = y;
		o[2] = z;
		o[3] = w;
	}

	/**
	 * Create and return a new vector initialised to the given values.
	 *
	 * @param x  Component 0.
	 * @param y  Component 1.
	 * @param z  Component 2.
	 * @param w  Component 3.
	 * @returns  A new length-4 `Float32Array`.
	 */
	static from(x: number, y: number, z: number, w: number): Float32Array {
		const o = Vec4.create();
		Vec4.set(o, x, y, z, w);
		return o;
	}

	/**
	 * Transform vector `a` by matrix `m` and store the result in `o`
	 * (`o = m * a`, treating `a` as a column vector).
	 *
	 * `o` may be the same buffer as `a`.
	 *
	 * @param o  Output vector (may alias `a`).
	 * @param a  Source vector.
	 * @param m  Transformation matrix.
	 * @returns  The vector `o`.
	 */
	static transformMat4(
		o: Float32Array,
		a: Float32Array,
		m: Float32Array,
	): Float32Array {
		const x = a[0],
			y = a[1],
			z = a[2],
			w = a[3];
		o[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
		o[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
		o[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
		o[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
		return o;
	}
}
