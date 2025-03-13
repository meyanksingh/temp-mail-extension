// DOM Elements
const emailDisplay = document.getElementById('email-address');
const generateBtn = document.getElementById('generate-btn');
const copyBtn = document.getElementById('copy-btn');
const emailInbox = document.getElementById('email-inbox');
const mailCounter = document.getElementById('mail-counter');

// Add refresh button to the inbox header
const inboxHeader = document.querySelector('.inbox-header');
const refreshBtn = document.createElement('button');
refreshBtn.className = 'button';
refreshBtn.style.padding = '8px';
refreshBtn.style.background = 'transparent';
refreshBtn.style.color = 'var(--primary-blue)';
refreshBtn.innerHTML = `
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
`;
refreshBtn.title = 'Refresh messages';
inboxHeader.appendChild(refreshBtn);

// State
let currentEmail = null;
let refreshInterval = null;
let emailRotationInterval = null;

// Constants
const REFRESH_INTERVAL = 30000; // 30 seconds
const EMAIL_ROTATION_INTERVAL = 3600000; // 1 hour in milliseconds
const API_BASE_URL = 'http://localhost:8000';

// Load saved email state
function loadEmailState() {
    const savedState = localStorage.getItem('emailState');
    if (savedState) {
        const { email, timestamp } = JSON.parse(savedState);
        const now = Date.now();
        const timeDiff = now - timestamp;
        
        // If less than 1 hour has passed, restore the email
        if (timeDiff < EMAIL_ROTATION_INTERVAL) {
            currentEmail = email;
            emailDisplay.textContent = email;
            
            // Start refresh cycle
            startEmailRefresh();
            
            // Schedule next rotation
            const remainingTime = EMAIL_ROTATION_INTERVAL - timeDiff;
            emailRotationInterval = setTimeout(generateEmail, remainingTime);
            
            return true;
        }
    }
    return false;
}

// Save email state
function saveEmailState(email) {
    const state = {
        email,
        timestamp: Date.now()
    };
    localStorage.setItem('emailState', JSON.stringify(state));
}

// Generate new email
async function generateEmail() {
    try {
        emailDisplay.textContent = 'Generating...';
        emailDisplay.classList.add('loading');
        
        const response = await fetch(`${API_BASE_URL}/tempmail`);
        if (!response.ok) throw new Error('Failed to generate email');
        
        const data = await response.json();
        currentEmail = data.email;
        emailDisplay.textContent = currentEmail;
        
        // Save the new email state
        saveEmailState(currentEmail);
        
        // Reset and start new refresh interval
        startEmailRefresh();
        
        // Clear inbox
        emailInbox.textContent = 'No messages yet';
        updateMailCounter(0);
        
        // Clear existing rotation interval and set new one
        if (emailRotationInterval) {
            clearTimeout(emailRotationInterval);
        }
        emailRotationInterval = setTimeout(generateEmail, EMAIL_ROTATION_INTERVAL);
    } catch (error) {
        emailDisplay.textContent = 'Error generating email. Try again.';
        console.error('Error:', error);
    } finally {
        emailDisplay.classList.remove('loading');
    }
}

// Update mail counter
function updateMailCounter(count) {
    mailCounter.textContent = `${count} message${count !== 1 ? 's' : ''}`;
}

// Fetch emails for current address
async function fetchEmails() {
    if (!currentEmail) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/tempmail/${currentEmail.toLowerCase()}`);
        if (!response.ok) throw new Error('Failed to fetch emails');
        
        const data = await response.json();
        const emails = data.messages || [];
        
        // Update mail counter
        updateMailCounter(emails.length);
        
        // Clear existing content
        emailInbox.textContent = '';
        
        // Check if there are any emails
        if (!emails || emails.length === 0) {
            emailInbox.textContent = 'No messages yet';
            return;
        }
        
        // Display emails in reverse chronological order
        emails.forEach((email, index) => {
            const emailElement = document.createElement('div');
            emailElement.className = `email-item ${index !== 0 ? 'mt-4' : ''}`;
            emailElement.style.padding = '16px';
            emailElement.style.borderRadius = '8px';
            emailElement.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            emailElement.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.05)';
            emailElement.style.border = '1px solid var(--lighter-blue)';
            
            // Extract email address and format date
            const fromMatch = email.From.match(/([^<\s]+@[^>\s]+)/);
            const fromEmail = fromMatch ? fromMatch[1] : email.From;
            const date = new Date(email.Date);
            const formattedDate = date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            
            // Format the email content
            emailElement.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 14px; font-weight: 500; color: var(--primary-blue);">${fromEmail}</span>
                        <span style="font-size: 12px; color: var(--gray-500);">${formattedDate}</span>
                    </div>
                    <h4 style="font-size: 14px; font-weight: 600; color: var(--gray-500);">${email.Subject || 'No Subject'}</h4>
                    <div style="font-size: 14px; color: var(--gray-500); white-space: pre-wrap; line-height: 1.5;">
                        ${formatEmailBody(email.Body)}
                    </div>
                </div>
            `;
            emailInbox.appendChild(emailElement);
        });
    } catch (error) {
        emailInbox.textContent = 'Error fetching emails';
        console.error('Error:', error);
    }
}

// Format email body to handle HTML content
function formatEmailBody(body) {
    if (!body) return '';
    
    try {
        // Try to extract content between Content-Type boundaries
        const parts = body.split(/--[a-zA-Z0-9]+/);
        
        // Look for HTML content first
        const htmlPart = parts.find(part => part.includes('Content-Type: text/html'));
        if (htmlPart) {
            // Extract content after the headers
            const htmlContent = htmlPart.split('\r\n\r\n').slice(1).join('\r\n\r\n');
            return htmlContent
                .replace(/<br\s*\/?>/gi, '\n')  // Replace <br> with newline
                .replace(/<[^>]+>/g, '')        // Remove other HTML tags
                .replace(/\n{3,}/g, '\n\n')     // Replace multiple newlines
                .trim();
        }
        
        // Look for plain text content
        const textPart = parts.find(part => part.includes('Content-Type: text/plain'));
        if (textPart) {
            // Extract content after the headers
            const textContent = textPart.split('\r\n\r\n').slice(1).join('\r\n\r\n');
            return textContent
                .replace(/\r\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }
        
        // If no structured content found, try to clean up the raw body
        const cleanBody = body
            .replace(/^(From|To|Subject|Body):.*?\n/gm, '') // Remove email headers
            .replace(/Content-[^\n]*\n/g, '')               // Remove content headers
            .replace(/\r\n/g, '\n')                         // Normalize line endings
            .replace(/\n{3,}/g, '\n\n')                    // Remove excess newlines
            .trim();
            
        return cleanBody || body; // Return cleaned body or original if cleaning results in empty string
    } catch (error) {
        console.warn('Failed to parse email body:', error);
        return body; // Return original body if parsing fails
    }
}

// Start email refresh interval
function startEmailRefresh() {
    // Clear existing interval if any
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // Fetch immediately
    fetchEmails();
    
    // Set up new interval
    refreshInterval = setInterval(fetchEmails, REFRESH_INTERVAL);
}

// Copy email to clipboard
async function copyEmailToClipboard() {
    if (!currentEmail) {
        console.log('No email to copy');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(currentEmail);
        const originalContent = copyBtn.innerHTML;
        copyBtn.innerHTML = 'Copied!';
        setTimeout(() => {
            copyBtn.innerHTML = originalContent;
        }, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
        const originalContent = copyBtn.innerHTML;
        copyBtn.innerHTML = 'Copy failed';
        setTimeout(() => {
            copyBtn.innerHTML = originalContent;
        }, 2000);
    }
}

// Event Listeners
generateBtn.addEventListener('click', generateEmail);
copyBtn.addEventListener('click', copyEmailToClipboard);
refreshBtn.addEventListener('click', () => {
    refreshBtn.style.transform = 'rotate(360deg)';
    refreshBtn.style.transition = 'transform 0.5s ease';
    fetchEmails().finally(() => {
        setTimeout(() => {
            refreshBtn.style.transform = 'rotate(0deg)';
            refreshBtn.style.transition = 'none';
        }, 500);
    });
});

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Try to load saved email state first
    if (!loadEmailState()) {
        // If no valid saved state, generate new email
        generateEmail();
    }
});

// Cleanup on window unload
window.addEventListener('unload', () => {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    if (emailRotationInterval) {
        clearTimeout(emailRotationInterval);
    }
});
