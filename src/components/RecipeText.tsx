import { textBlocks } from '../lib/recipes'

/** Numbering restarts after a subheading, because a sub-recipe's steps are its own. */
export function RecipeText({ title, text, numbered = false, className }: { title: string; text: string; numbered?: boolean; className?: string }) {
  const List = numbered ? 'ol' : 'ul'
  return (
    <section className={className}>
      <h2>{title}</h2>
      {textBlocks(text).map((b, i) => (
        <div key={i}>
          {b.heading && <h3>{b.heading}</h3>}
          <List>
            {b.lines.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </List>
        </div>
      ))}
    </section>
  )
}
