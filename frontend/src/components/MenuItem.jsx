// migrated from menu-item.css
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Box, Typography, styled } from '@mui/material';

const brand = {
  primary: '#00704a',
  primaryHover: '#147d56',
  primaryActive: '#004a34',
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  border: '#e0e0e0',
  bgLight: '#f8f9f8',
  shadowSm: '0 0 6px rgba(0,0,0,0.06)',
  shadowMd: '0 2px 12px rgba(0,0,0,0.08)',
  shadowHover: '0 4px 12px rgba(0,0,0,0.15)',
  fontBase: "'Montserrat', sans-serif",
  fontDisplay: "'DIN Alternate Bold', 'Montserrat', sans-serif",
}

// TODO: .bestseller-badge, .premium-badge, .unavailable-badge and rating/tag classes
// could not be fully migrated to JSX because they are not utilized in the current component structure.

const ItemCard = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isAvailable',
})(({ theme, isAvailable }) => ({
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  overflow: 'hidden',
  cursor: isAvailable ? 'pointer' : 'default',
  transition: 'all 0.3s cubic-bezier(0.23, 1, 0.32, 1)',
  boxShadow: brand.shadowSm,
  height: '280px',
  position: 'relative',
  border: `1px solid ${brand.border}`,
  opacity: isAvailable ? 1 : 0.7,

  ...(isAvailable && {
    '&:hover': {
      boxShadow: `${brand.shadowHover}, inset 0 0 0 1px rgba(26, 74, 53, 0.08)`,
      transform: 'translateY(-4px)',
      borderColor: 'rgba(26, 74, 53, 0.35)',
    },
    '&:hover img': {
      transform: 'scale(1.08)',
    }
  }),

  [theme.breakpoints.down('md')]: {
    height: '280px',
    borderRadius: '12px',
  },

  [theme.breakpoints.down('sm')]: {
    height: '220px',
    borderRadius: '10px',
  }
}));

const ItemCta = styled('button')(({ theme }) => ({
  position: 'absolute',
  top: '10px',
  right: '10px',
  zIndex: 3,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #2f7f5e',
  borderRadius: '12px',
  background: '#2a7a59',
  color: '#ffffff',
  width: '28px',
  height: '28px',
  padding: 0,
  fontFamily: brand.fontBase,
  fontSize: '16px',
  fontWeight: 700,
  lineHeight: 1,
  boxShadow: 'none',
  transition: 'all 0.2s ease',

  '&:hover:not(:disabled)': {
    transform: 'translateY(-2px)',
    backgroundColor: brand.primaryHover,
    borderColor: brand.primaryHover,
    color: '#ffffff',
    boxShadow: '0 8px 18px rgba(17, 24, 39, 0.08)',
  },

  '&:disabled': {
    background: '#9ca3af',
    boxShadow: 'none',
    cursor: 'not-allowed',
  },

  [theme.breakpoints.down('sm')]: {
    width: '24px',
    height: '24px',
    fontSize: '14px',
    borderRadius: '8px',
    top: '7px',
    right: '7px',

    '& span': {
      fontSize: '13px',
    }
  }
}));

const ItemImageContainer = styled(Box)(({ theme }) => ({
  position: 'relative',
  width: '100%',
  height: '180px',
  overflow: 'hidden',
  backgroundColor: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',

  [theme.breakpoints.down('sm')]: {
    height: '120px',
  }
}));

const ImgPlaceholder = styled(Box)(() => ({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  backgroundColor: '#ffffff',
  color: '#b0b8be',
}));

const ItemImage = styled('img')(({ theme }) => ({
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  padding: '8px',
  transition: 'transform 0.4s ease',
  backgroundColor: '#ffffff',

  [theme.breakpoints.down('sm')]: {
    padding: '6px',
  }
}));

const ItemContent = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  padding: '12px',
  flex: 1,
  gap: '6px',
  background: brand.bgLight,

  [theme.breakpoints.down('sm')]: {
    padding: '8px',
    gap: '3px',
  }
}));

const ItemName = styled(Typography)(({ theme }) => ({
  fontFamily: brand.fontDisplay,
  fontSize: '15px',
  fontWeight: 600,
  color: brand.textPrimary,
  margin: 0,
  lineHeight: 1.2,
  flex: 1,
  wordBreak: 'break-word',

  [theme.breakpoints.down('sm')]: {
    fontSize: '12px',
    display: '-webkit-box',
    WebkitLineClamp: 1,
    lineClamp: 1,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }
}));

const ItemDescription = styled(Typography)(({ theme }) => ({
  fontFamily: brand.fontBase,
  fontSize: '13px',
  fontWeight: 400,
  color: brand.textSecondary,
  margin: 0,
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitLineClamp: 1,
  lineClamp: 1,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  textOverflow: 'ellipsis',

  [theme.breakpoints.down('sm')]: {
    WebkitLineClamp: 2,
    lineClamp: 2,
    fontSize: '11px',
    lineHeight: 1.25,
    marginTop: '-1px',
  }
}));

const ItemBottom = styled(Box)(({ theme }) => ({
  marginTop: 'auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  flexWrap: 'nowrap',
  whiteSpace: 'nowrap',

  [theme.breakpoints.down('sm')]: {
    gap: '4px',
  }
}));

const StatusPill = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isAvailable',
})(({ theme, isAvailable }) => ({
  width: 'fit-content',
  padding: '4px 10px',
  borderRadius: '20px',
  fontWeight: 500,
  fontSize: '12px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  background: isAvailable ? '#edf3ef' : '#fee2e2',
  color: isAvailable ? '#5b6b62' : '#b91c1c',

  [theme.breakpoints.down('sm')]: {
    fontSize: '10px',
    padding: '3px 7px',
  }
}));

const ItemPrice = styled(Typography)(({ theme }) => ({
  fontFamily: brand.fontBase,
  fontSize: '17px',
  fontWeight: 700,
  color: brand.textPrimary,
  marginTop: 0,
  flexShrink: 0,
  whiteSpace: 'nowrap',

  [theme.breakpoints.down('sm')]: {
    fontSize: '13px',
  }
}));

export default function MenuItem({ item }) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);
  const showPlaceholder = !item.hasImage || imageError;
  const formatPrice = (p) => (
    <>
      <Box component="span" sx={{ fontSize: '0.72em', fontWeight: 600, opacity: 0.72, letterSpacing: '0.02em' }}>LL</Box> {Number(p).toLocaleString()}
    </>
  );

  const handleClick = () => {
    if (item.isAvailable) {
      navigate(`/item/${item.id}`);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && item.isAvailable) {
      navigate(`/item/${item.id}`);
    }
  };

  const handleAddClick = (e) => {
    e.stopPropagation();
    if (item.isAvailable) {
      navigate(`/item/${item.id}`);
    }
  };

  return (
    <ItemCard
      isAvailable={item.isAvailable}
      role={item.isAvailable ? "button" : undefined}
      tabIndex={item.isAvailable ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <ItemCta
        type="button"
        aria-label={item.isAvailable ? `Add ${item.name}` : `${item.name} unavailable`}
        onClick={handleAddClick}
        disabled={!item.isAvailable}
      >
        <Box component="span" sx={{ fontSize: '15px', lineHeight: 1 }}>+</Box>
      </ItemCta>

      <ItemImageContainer>
        {showPlaceholder ? (
          <ImgPlaceholder>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <Box component="span" sx={{ fontSize: '10px', fontWeight: 600, fontFamily: brand.fontBase }}>
              Image coming soon
            </Box>
          </ImgPlaceholder>
        ) : (
          <ItemImage
            src={item.image}
            alt={item.name}
            onError={() => setImageError(true)}
          />
        )}
      </ItemImageContainer>

      <ItemContent>
        <ItemName>{item.name}</ItemName>
        <ItemDescription>{item.description}</ItemDescription>
        <ItemBottom>
          <StatusPill isAvailable={item.isAvailable}>
            {item.isAvailable ? 'Available' : 'Out of stock'}
          </StatusPill>
          <ItemPrice>{formatPrice(item.basePrice)}</ItemPrice>
        </ItemBottom>
      </ItemContent>
    </ItemCard>
  );
}
