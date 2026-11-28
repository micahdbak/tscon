/**
 * Pointer press, release, ownership, and click consumption state.
 *
 * One instance lives on each {@link Canvas} as `canvas.click`. Read the public
 * fields directly. Call {@link consume} before handling a complete click, and
 * call {@link clear} at the end of each frame.
 *
 * @example
 * ```ts
 * const click = canvas.click;
 *
 * if (click.pressed() && click.claim("editor")) {
 *   // start a drag
 * }
 *
 * if (click.consume()) {
 *   // click.down_row and click.row describe the gesture
 * }
 *
 * click.clear();
 * ```
 */
export class Click {
	/** Release row, or undefined while pressed. */
	row: number | undefined = undefined;
	/** Release column, or undefined while pressed. */
	col: number | undefined = undefined;
	/** Press row, or undefined when idle. */
	down_row: number | undefined = undefined;
	/** Press column, or undefined when idle. */
	down_col: number | undefined = undefined;
	/** Current owner, or `""` when unclaimed. */
	owner = "";
	/** Whether {@link consume} already claimed this click. */
	consumed = false;

	/** Whether a pointer press is active. */
	pressed(): boolean {
		return this.down_row !== undefined
			&& this.down_col !== undefined
			&& this.row === undefined
			&& this.col === undefined;
	}

	/**
	 * Claim the active press.
	 *
	 * @param owner  Unique owner name.
	 * @returns      `true` when claimed or already owned by `owner`.
	 */
	claim(owner: string): boolean {
		if (!this.pressed() || owner === "") {
			return false;
		}

		if (this.owner !== "" && this.owner !== owner) {
			return false;
		}

		this.owner = owner;
		return true;
	}

	/**
	 * Release ownership claimed with {@link claim}.
	 *
	 * @param owner  Owner to release.
	 */
	release(owner: string): void {
		if (this.owner === owner) {
			this.owner = "";
		}
	}

	/**
	 * Claim a complete, unconsumed click.
	 *
	 * @returns  `true` once, then `false`.
	 */
	consume(): boolean {
		if (
			this.pressed() ||
			this.consumed ||
			this.owner !== "" ||
			this.row === undefined ||
			this.col === undefined ||
			this.down_row === undefined ||
			this.down_col === undefined
		) {
			return false;
		}

		this.consumed = true;
		return true;
	}

	/** Clear a completed click after a frame. Does nothing while pressed. */
	clear(): void {
		if (!this.pressed()) {
			cancelClick(this);
		}
	}
}

export function startClick(
	click: Click,
	down_row: number | undefined,
	down_col: number | undefined,
): void {
	cancelClick(click);

	if (down_row === undefined || down_col === undefined) {
		return;
	}

	click.down_row = down_row;
	click.down_col = down_col;
}

export function finishClick(
	click: Click,
	row: number | undefined,
	col: number | undefined,
): void {
	if (!click.pressed()) {
		return;
	}

	if (row === undefined || col === undefined) {
		cancelClick(click);
		return;
	}

	click.row = row;
	click.col = col;
}

export function cancelClick(click: Click): void {
	click.row = undefined;
	click.col = undefined;
	click.down_row = undefined;
	click.down_col = undefined;
	click.owner = "";
	click.consumed = false;
}
