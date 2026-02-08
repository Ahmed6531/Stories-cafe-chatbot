import MenuItem from './MenuItem'
import '../styles/menu-list.css'

export default function MenuList({ items }) {
  return (
    <div className="menu-list-container">
      <div className="menu-items-grid compact">
        {items.map((item) => (
          <MenuItem key={item.slug} item={item} />
        ))}
      </div>
    </div>
  )
}
