/**
 * Convert a title to a URL-safe slug
 */
export function slugify(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
        .slice(0, 50); // Limit length
}

/**
 * Create a branch-safe slug from issue title
 */
export function createBranchSlug(title: string): string {
    const slug = slugify(title);
    return slug || 'task';
}
