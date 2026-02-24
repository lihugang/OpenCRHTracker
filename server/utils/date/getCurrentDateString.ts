export default function getCurrentDateString() {
    const date = new Date();
    const yearString = date.getFullYear().toString();
    const monthString = (date.getMonth() + 1) /* month index */
        .toString()
        .padStart(2, '0');
    const dateString = date.getDate().toString().padStart(2, '0');
    return `${yearString}${monthString}${dateString}`;
}
