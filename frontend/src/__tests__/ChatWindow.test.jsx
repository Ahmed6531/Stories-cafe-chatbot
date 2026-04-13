import { render, screen } from "@testing-library/react";
import ChatWindow from "../components/ChatWindow";

test("renders upsell suggestion in chat", async () => {
  // Mock API response
  const mockReply = "Added latte to your cart. Would you like to add a croissant as well?";
  render(<ChatWindow initialMessages={[{ from: "bot", text: mockReply }]} />);
  expect(screen.getByText(/croissant/)).toBeInTheDocument();
});
