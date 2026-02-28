export class TimelineAxisRenderer {
    constructor({ canvas, speedRange = { min: -15, max: 15 } } = {}) {
        if (!canvas) {
            throw new Error('[TimelineAxisRenderer] canvas is required');
        }

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        if (!this.ctx) {
            throw new Error('[TimelineAxisRenderer] 2D context not available');
        }

        this.speedRange = speedRange;
        this.paddingX = 12;
        this.axisHeightRatioFromBottom = 0.10;
        this.axisLineWidth = 2;

        this.tickValues = [-15, -10, -5, 0, 5, 10, 15];
        this.tickLenMajor = 10;
        this.tickGap = 6;

        this.colors = {
            axis: 'rgba(214,188,255,0.75)',
            tick: 'rgba(214,188,255,0.45)',
            tickCenter: 'rgba(255,226,148,0.95)',
            label: 'rgba(207,216,255,0.95)'
        };

        this._layout = {
            cssWidth: 0,
            cssHeight: 0,
            pxWidth: 0,
            pxHeight: 0,
            dpr: 1,
            axisY: 0,
            xMin: 0,
            xMax: 0
        };
    }

    layoutFromHostRect({ width, height } = {}) {
        const w = Number(width);
        const h = Number(height);
        const cssWidth = Number.isFinite(w) && w > 0 ? w : this.canvas.clientWidth;
        const cssHeight = Number.isFinite(h) && h > 0 ? h : this.canvas.clientHeight;

        const dpr = Math.max(1, Math.round((window.devicePixelRatio || 1) * 100) / 100);

        this._layout.cssWidth = cssWidth;
        this._layout.cssHeight = cssHeight;
        this._layout.dpr = dpr;
        this._layout.pxWidth = Math.max(1, Math.round(cssWidth * dpr));
        this._layout.pxHeight = Math.max(1, Math.round(cssHeight * dpr));

        this.canvas.width = this._layout.pxWidth;
        this.canvas.height = this._layout.pxHeight;
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;

        const pad = this.paddingX * dpr;
        this._layout.xMin = pad;
        this._layout.xMax = Math.max(pad + 1, this._layout.pxWidth - pad);

        const axisBottom = Math.max(0, Math.round(cssHeight * this.axisHeightRatioFromBottom));
        this._layout.axisY = Math.max(0, Math.round(axisBottom * dpr));

        return this._layout;
    }

    getAxisY() {
        return this._layout.axisY / this._layout.dpr;
    }

    speedToX(speed) {
        const v = Number(speed);
        const clamped = this._clampSpeed(Number.isFinite(v) ? v : 0);
        const pct = (clamped - this.speedRange.min) / (this.speedRange.max - this.speedRange.min);
        const x = this._layout.xMin + pct * (this._layout.xMax - this._layout.xMin);
        return x / this._layout.dpr;
    }

    render() {
        if (!this._layout.pxWidth || !this._layout.pxHeight) {
            this.layoutFromHostRect();
        }

        const ctx = this.ctx;
        const { pxWidth, pxHeight, axisY, dpr, xMin, xMax } = this._layout;

        ctx.clearRect(0, 0, pxWidth, pxHeight);

        // Axis baseline
        ctx.save();
        ctx.lineWidth = this.axisLineWidth * dpr;
        ctx.strokeStyle = this.colors.axis;
        ctx.beginPath();
        ctx.moveTo(xMin, axisY + 0.5);
        ctx.lineTo(xMax, axisY + 0.5);
        ctx.stroke();
        ctx.restore();

        // Ticks + labels (above axis)
        const tickBottom = axisY - this.axisLineWidth * dpr;
        const tickTop = tickBottom - this.tickLenMajor * dpr;
        const labelY = tickTop - this.tickGap * dpr;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = `${Math.max(10, Math.round(9 * dpr))}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;

        for (const v of this.tickValues) {
            const x = (this.speedToX(v) * dpr);
            const isCenter = v === 0;

            ctx.strokeStyle = isCenter ? this.colors.tickCenter : this.colors.tick;
            ctx.lineWidth = 1 * dpr;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, tickBottom);
            ctx.lineTo(x + 0.5, tickTop);
            ctx.stroke();

            ctx.fillStyle = this.colors.label;
            const text = v > 0 ? `+${v}` : `${v}`;
            ctx.fillText(text, x, labelY);
        }

        ctx.restore();
    }

    _clampSpeed(v) {
        return Math.max(this.speedRange.min, Math.min(this.speedRange.max, v));
    }
}
