<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI components

Always reach for shadcn first when adding a new UI component. Run `npx shadcn add <component>` to install it, then import from `@/components/ui/<component>`. Only build a custom component when shadcn has no relevant equivalent.
