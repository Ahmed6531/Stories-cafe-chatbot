import Skeleton from '@mui/material/Skeleton'
import '../styles/menu-list.css'

const PLACEHOLDER_COUNT = 8

export default function MenuSkeleton() {
  return (
    <div className="menu-list-container">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '24px',
          padding: '24px 0',
        }}
      >
        {Array.from({ length: PLACEHOLDER_COUNT }).map((_, index) => (
          <div
            key={`menu-skeleton-${index}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: 280,
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid #e0e0e0',
              backgroundColor: '#fff',
            }}
          >
            <Skeleton animation="wave" variant="rectangular" width="100%" height={180} />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                gap: 6,
                padding: 12,
                background: '#f8f9f8',
              }}
            >
              <Skeleton animation="wave" variant="text" width="58%" height={24} />
              <Skeleton animation="wave" variant="text" width="72%" height={18} />

              <div
                style={{
                  marginTop: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Skeleton animation="wave" variant="rounded" width={88} height={24} />
                <Skeleton animation="wave" variant="text" width={78} height={28} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
