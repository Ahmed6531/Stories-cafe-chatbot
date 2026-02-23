import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Typography, styled } from '@mui/material'
import { fetchMenuItemById } from '../API/menuApi'

const brand = {
  primary: '#00704a',
  primaryHover: '#147d56',
  primaryActive: '#004a34',
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  border: '#e0e0e0',
  borderLight: '#e9e9e9',
  bgLight: '#f8f9f8',
  shadowSm: '0 0 6px rgba(0,0,0,0.06)',
  shadowHover: '0 4px 12px rgba(0,0,0,0.15)',
  fontBase: "'Montserrat', sans-serif",
  fontDisplay: "'DIN Alternate Bold', 'Montserrat', sans-serif",
}

const PageWrap = styled(Box)(() => ({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}));

const StateTitle = styled(Typography)(() => ({
  margin: 0,
  fontFamily: brand.fontBase,
  fontSize: '28px',
  fontWeight: 600,
  color: brand.primary,
}));

const StatusText = styled(Typography)(() => ({
  fontFamily: brand.fontBase,
  fontSize: '16px',
  fontWeight: 500,
  color: brand.textSecondary,
  margin: 0,
}));

const DetailsCard = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '320px 1fr',
  gap: '18px',
  border: `1px solid ${brand.borderLight}`,
  borderRadius: '18px',
  background: '#fff',
  padding: '18px',
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
  },
}))

const DetailsImgContainer = styled(Box)(() => ({
  position: 'relative',
  background: '#fff',
  borderRadius: '16px',
  border: `1px solid ${brand.borderLight}`,
  display: 'grid',
  placeItems: 'center',
  padding: '12px',
  '& img': {
    width: '100%',
    height: 'auto',
    objectFit: 'contain',
  },
}))

const ImgPlaceholder = styled(Box)(() => ({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  minHeight: '220px',
  backgroundColor: '#ffffff',
  color: '#b0b8be',
}))

const DetailsInfo = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}))

const DetailsPriceSection = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}))

const DetailsPrice = styled(Typography)(() => ({
  fontWeight: 900,
  color: '#006241',
  fontSize: '18px',
  fontFamily: brand.fontBase,
}))

const TotalPrice = styled(Typography)(() => ({
  fontSize: '14px',
  color: brand.textSecondary,
  fontWeight: 600,
  fontFamily: brand.fontBase,
}))

const CurrencyPrefix = styled('span')(() => ({
  fontSize: '0.72em',
  fontWeight: 600,
  opacity: 0.72,
  letterSpacing: '0.02em',
}))

const OptionsSection = styled(Box)(() => ({
  borderTop: `1px solid ${brand.borderLight}`,
  paddingTop: '16px',
}))

const OptionsTitle = styled(Typography)(() => ({
  fontSize: '14px',
  fontWeight: 700,
  color: brand.textPrimary,
  margin: '0 0 12px 0',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontFamily: brand.fontBase,
}))

const OptionsList = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}))

const OptionItem = styled('label')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  cursor: 'pointer',
  padding: '10px',
  borderRadius: '8px',
  transition: 'all 0.2s ease',
  border: '1px solid transparent',
  '&:hover': {
    backgroundColor: '#f5f5f5',
    borderColor: brand.border,
  },
  '& input[type="radio"]': {
    cursor: 'pointer',
    accentColor: brand.primary,
  }
}))

const OptionLabel = styled('span')(() => ({
  fontSize: '14px',
  color: brand.textPrimary,
  fontWeight: 500,
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  fontFamily: brand.fontBase,
}))

const OptionPrice = styled('span')(() => ({
  color: '#006241',
  fontWeight: 700,
  fontSize: '13px',
}))

const QtyCounter = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px',
  backgroundColor: '#f5f5f5',
  borderRadius: '8px',
  width: 'fit-content',
}))

const QtyLabel = styled(Typography)(() => ({
  fontSize: '14px',
  fontWeight: 600,
  color: brand.textPrimary,
  fontFamily: brand.fontBase,
}))

const QtyBtn = styled('button')(() => ({
  border: `2px solid ${brand.primary}`,
  background: '#fff',
  color: brand.primary,
  width: '32px',
  height: '32px',
  padding: 0,
  borderRadius: '6px',
  fontWeight: 700,
  fontSize: '18px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    backgroundColor: brand.primary,
    color: '#fff',
  }
}))

const QtyDisplay = styled('span')(() => ({
  fontWeight: 700,
  fontSize: '16px',
  color: brand.textPrimary,
  minWidth: '30px',
  textAlign: 'center',
  fontFamily: brand.fontBase,
}))

const PrimaryBtn = styled('button')(() => ({
  border: 0,
  background: brand.primary,
  color: '#ffffff',
  fontWeight: 900,
  borderRadius: '12px',
  padding: '12px 14px',
  cursor: 'pointer',
  width: '100%',
  fontSize: '16px',
  fontFamily: brand.fontBase,
  transition: 'all 0.2s ease',
  '&:hover': {
    background: brand.primaryHover,
  },
  '&:disabled': {
    background: '#ccc',
    cursor: 'not-allowed',
  }
}))

export default function MenuItemDetails() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  const [selectedOption, setSelectedOption] = useState(null)
  const [imageError, setImageError] = useState(false)

  // Fetch item from API on mount
  useEffect(() => {
    const loadItem = async () => {
      try {
        setLoading(true)
        const data = await fetchMenuItemById(id)
        setItem(data)
      } catch (err) {
        console.error('Failed to fetch item:', err)
        setItem(null)
      } finally {
        setLoading(false)
      }
    }

    loadItem()
  }, [id])

  useEffect(() => {
    setImageError(false)
  }, [item?.id])

  if (loading) {
    return (
      <PageWrap>
        <Box sx={{ minHeight: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', textAlign: 'center' }}>
          <StateTitle component="h1">Loading item...</StateTitle>
          <StatusText>Please wait a moment.</StatusText>
        </Box>
      </PageWrap>
    )
  }

  if (!item) {
    return (
      <PageWrap>
        <Box sx={{ minHeight: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', textAlign: 'center' }}>
          <StateTitle component="h1">Item not found</StateTitle>
          <StatusText>Try browsing the menu and selecting another item.</StatusText>
        </Box>
      </PageWrap>
    )
  }

  // Calculate price with selected option
  const optionPriceDelta = selectedOption ? item.options.find(opt => opt.label === selectedOption)?.priceDelta || 0 : 0
  const finalPrice = item.basePrice + optionPriceDelta
  const totalPrice = finalPrice * qty
  const showPlaceholder = !item.hasImage || imageError

  const handleAddToCart = () => {
    // Validate that an option is selected if options exist
    if (item.options && item.options.length > 0 && !selectedOption) {
      alert('Please select an option')
      return
    }

    // TODO: Implement add to cart logic
    // Missing: dispatch({ type: 'ADD_TO_CART', payload: { ... } }) to add item to state
    navigate('/cart')
  }

  return (
    <PageWrap>
      <DetailsCard>
        <DetailsImgContainer>
          {showPlaceholder ? (
            <ImgPlaceholder>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
              <Box component="span" sx={{ fontSize: '12px', fontWeight: 600, fontFamily: brand.fontBase }}>
                Image coming soon
              </Box>
            </ImgPlaceholder>
          ) : (
            <img
              src={item.image}
              alt={item.name}
              onError={() => setImageError(true)}
            />
          )}
        </DetailsImgContainer>

        <DetailsInfo>
          <Typography component="h1" sx={{ fontFamily: brand.fontDisplay, fontSize: '40px', fontWeight: 700, color: brand.primary, m: 0, letterSpacing: '-0.5px' }}>
            {item.name}
          </Typography>
          <Typography sx={{ fontFamily: brand.fontBase, fontSize: '16px', color: brand.textSecondary, m: 0, fontWeight: 400 }}>
            {item.description}
          </Typography>

          {/* Options Section */}
          {item.options && item.options.length > 0 && (
            <OptionsSection>
              <OptionsTitle component="h3">Select Size/Type</OptionsTitle>
              <OptionsList>
                {item.options.map((option) => (
                  <OptionItem key={option.label}>
                    <input
                      type="radio"
                      name="item-option"
                      value={option.label}
                      checked={selectedOption === option.label}
                      onChange={(e) => setSelectedOption(e.target.value)}
                    />
                    <OptionLabel>
                      {option.label}
                      {option.priceDelta > 0 && (
                        <OptionPrice>
                          +<CurrencyPrefix>LL</CurrencyPrefix> {Number(option.priceDelta).toLocaleString()}
                        </OptionPrice>
                      )}
                    </OptionLabel>
                  </OptionItem>
                ))}
              </OptionsList>
            </OptionsSection>
          )}

          {/* Price Display */}
          <DetailsPriceSection>
            <DetailsPrice>
              <CurrencyPrefix>LL</CurrencyPrefix> {Number(finalPrice).toLocaleString()}
            </DetailsPrice>
            {qty > 1 && (
              <TotalPrice>
                Total: <CurrencyPrefix>LL</CurrencyPrefix> {Number(totalPrice).toLocaleString()}
              </TotalPrice>
            )}
          </DetailsPriceSection>

          {/* Quantity Counter */}
          <QtyCounter>
            <QtyLabel component="span">Quantity:</QtyLabel>
            <QtyBtn
              type="button"
              onClick={() => setQty(Math.max(1, qty - 1))}
            >
              −
            </QtyBtn>
            <QtyDisplay>{qty}</QtyDisplay>
            <QtyBtn
              type="button"
              onClick={() => setQty(qty + 1)}
            >
              +
            </QtyBtn>
          </QtyCounter>

          {/* Add to Cart Button */}
          <PrimaryBtn
            type="button"
            onClick={handleAddToCart}
            disabled={!item.isAvailable}
          >
            Add to Cart
          </PrimaryBtn>
        </DetailsInfo>
      </DetailsCard>
    </PageWrap>
  )
}
