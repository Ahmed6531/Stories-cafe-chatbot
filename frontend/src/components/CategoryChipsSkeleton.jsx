import Skeleton from '@mui/material/Skeleton'

const PLACEHOLDER_COUNT = 8

export default function CategoryChipsSkeleton() {
  return (
    <div className="catbar-wrap" aria-hidden="true">
      <div className="catbar">
        <div className="catbar-inner">
          {Array.from({ length: PLACEHOLDER_COUNT }).map((_, index) => (
            <div key={`category-chip-skeleton-${index}`} className="cat-chip cat-chip-skeleton">
              <div className="cat-chip-content">
                <Skeleton animation="wave" variant="rounded" width={56} height={56} sx={{ borderRadius: '12px' }} />
                <Skeleton animation="wave" variant="text" width={72} height={18} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
