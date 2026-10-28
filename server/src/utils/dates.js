export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
export const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);
export const monthKey = (d) => new Date(d).toISOString().slice(0, 7);
