// migrated from menu-list.css
import { Box, styled, keyframes } from '@mui/material';
import MenuItem from './MenuItem';
import { menuCardLayout } from '../theme/layoutTokens';

// TODO: .loading-message and .empty-message classes could not be cleanly migrated 
// because they are not present in the markup of this component right now.


const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const ListContainer = styled(Box)(() => ({
  width: '100%',
  animation: `${fadeIn} 0.4s ease-out`,
}));

const ItemsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: menuCardLayout.grid.lg,
  gap: menuCardLayout.gap.lg,
  padding: '8px 0 14px',

  [theme.breakpoints.down('lg')]: {
    gridTemplateColumns: menuCardLayout.grid.md,
    gap: menuCardLayout.gap.md,
  },

  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: menuCardLayout.grid.sm,
    gap: menuCardLayout.gap.md,
    padding: '16px 0',
  },

  [theme.breakpoints.down('sm')]: {
    gridTemplateColumns: menuCardLayout.grid.xs,
    gap: menuCardLayout.gap.xs,
    padding: '10px 0 16px',
  },

  '@media (orientation: landscape) and (max-width: 900px)': {
    gridTemplateColumns: menuCardLayout.grid.landscape,
    gap: menuCardLayout.gap.landscape,
  },
}));

export default function MenuList({ items }) {
  return (
    <ListContainer>
      <ItemsGrid>
        {items.map((item) => (
          <MenuItem key={item.id} item={item} />
        ))}
      </ItemsGrid>
    </ListContainer>
  );
}
