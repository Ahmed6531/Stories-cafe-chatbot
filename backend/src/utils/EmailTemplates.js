// Signup welcome email
export function welcomeTemplate({ name }) {
  return `
    <h1>Welcome, ${name}!</h1>
    <p>Thanks for signing up !</p>
  `;
}

export function verifyButtonTemplate({ name, actionLink }) {
  return `
    <h1>Hello, ${name}</h1>
    <p>Click the button below to verify your account:</p>
    <a href="${actionLink}" 
       style="display:inline-block; padding:10px 20px; background-color:#007bff; color:white; text-decoration:none; border-radius:5px;">
       Verify This
    </a>
    <p>If you didn't request this, please ignore this email.</p>
  `;
}
