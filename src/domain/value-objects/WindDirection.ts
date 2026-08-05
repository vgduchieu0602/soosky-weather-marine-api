export { WindDirection as default };

const MIN_DEGREES = 0;
const MAX_DEGREES = 360;

class WindDirection {
    private constructor (public readonly degrees: number) {}

    public static from (value: unknown): WindDirection | null {
        if (
            typeof value !== "number"
            || !Number.isFinite(value)
            || value < MIN_DEGREES
            || value > MAX_DEGREES
        ) {
            return null;
        }

        return new WindDirection(value);
    }
}
