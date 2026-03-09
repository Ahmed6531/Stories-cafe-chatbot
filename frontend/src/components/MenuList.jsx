// migrated from menu-list.css
import { Box, styled, keyframes } from '@mui/material';
import MenuItem from './MenuItem';

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
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: '24px',
  padding: '8px 0 14px',

  [theme.breakpoints.down('lg')]: {
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },

  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '16px',
    padding: '16px 0',
  },

  [theme.breakpoints.down('sm')]: {
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
    padding: '10px 0 16px',
  }
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
