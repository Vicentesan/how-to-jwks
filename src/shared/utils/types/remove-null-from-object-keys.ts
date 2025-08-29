export type RemoveNullFromObjectKeys<T> = { [Key in keyof T]: NonNullable<T[Key]> };
