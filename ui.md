🎨 Design System Prompt: "Harmony Express" (CRH Aesthetic)
Role: Expert UI/UX Designer specialized in Industrial Design Systems.
Task: Define a comprehensive UI Style Guide and Tailwind CSS configuration for a Vue 3 project named "EMU-Track".

1. Visual Metaphor & Vibe
   The design must evoke the feeling of the China Railway "Harmony" (CRH) EMU trains: Clean, fast, aerodynamic, and high-tech.
   Atmosphere: Industrial precision combined with modern "Airy" minimalism.
   Key Element: "The Boarding Pass" — Cards should feel like high-end electronic tickets.
   Motion: Everything should imply horizontal speed and smooth transitions.
2. Color Palette (Tailwind Config Object)
   code
   JavaScript
   {
   colors: {
   'crh-white': '#FFFFFF', // Body of the train
   'crh-blue': '#00529B', // Signature "Harmony Blue"
   'crh-silver': '#A9AFB6', // Metallic accents
   'crh-slate': '#F8FAFC', // Background for "breathing room"
   'crh-grey-dark': '#334155', // Primary text for high readability
   'status-running': '#10B981', // Success green
   'status-delayed': '#EF4444', // Warning red
   }
   }
3. Design Tokens (Visual Primitives)
   Typography:
   Body: 'Inter' or 'SF Pro Display' (Clean, modern sans).
   Technical Data (EMU IDs/Times): 'JetBrains Mono' or 'Roboto Mono' (Monospaced for a "machinery nameplate" look).
   Surface & Depth:
   Cards: White background, rounded-xl (12px), with a very subtle blue-tinted shadow: box-shadow: 0 4px 20px -2px rgba(0, 82, 155, 0.08).
   Borders: 1px solid #E2E8F0.
   The "Speed" Factor:
   Use slanted edges (e.g., clip-path or skew) sparingly for decorative elements.
   Progress bars and dividers should have a horizontal gradient from crh-blue to transparent to simulate motion blur.
4. Component UI Logic (Vue + Tailwind)
   The "Boarding Pass" Card:
   A vertical blue accent bar on the left.
   Hover state: The card shifts 4px to the right with a soft "motion streak" glow at the bottom.
   The "Track" Timeline:
   A 2px solid crh-blue vertical line.
   Station nodes are hollow circles that fill up as the train passes.
   Active segment: A pulsing gradient line.
   Input Fields:
   Minimalist search bars with an "Aerodynamic" rounded-full shape.
5. Output Expectation
   Please generate:
   A tailwind.config.js file with these custom tokens.
   A BaseStyle.css (or Scoped CSS) defining the "Motion Streak" animations and the Railway Track line styles.
   A set of Vue 3 functional components (Card, Badge, TimelineNode) that implement these visual rules purely through Tailwind classes.
   🎨 Design System Prompt: "Harmony Express" (CRH Aesthetic)
   Role: Expert UI/UX Designer specialized in Industrial Design Systems.
   Task: Define a comprehensive UI Style Guide and Tailwind CSS configuration for a Vue 3 project named "EMU-Track".
6. Visual Metaphor & Vibe
   The design must evoke the feeling of the China Railway "Harmony" (CRH) EMU trains: Clean, fast, aerodynamic, and high-tech.
   Atmosphere: Industrial precision combined with modern "Airy" minimalism.
   Key Element: "The Boarding Pass" — Cards should feel like high-end electronic tickets.
   Motion: Everything should imply horizontal speed and smooth transitions.
7. Color Palette (Tailwind Config Object)
   code
   JavaScript
   {
   colors: {
   'crh-white': '#FFFFFF', // Body of the train
   'crh-blue': '#00529B', // Signature "Harmony Blue"
   'crh-silver': '#A9AFB6', // Metallic accents
   'crh-slate': '#F8FAFC', // Background for "breathing room"
   'crh-grey-dark': '#334155', // Primary text for high readability
   'status-running': '#10B981', // Success green
   'status-delayed': '#EF4444', // Warning red
   }
   }
8. Design Tokens (Visual Primitives)
   Typography:
   Body: 'Inter' or 'SF Pro Display' (Clean, modern sans).
   Technical Data (EMU IDs/Times): 'JetBrains Mono' or 'Roboto Mono' (Monospaced for a "machinery nameplate" look).
   Surface & Depth:
   Cards: White background, rounded-xl (12px), with a very subtle blue-tinted shadow: box-shadow: 0 4px 20px -2px rgba(0, 82, 155, 0.08).
   Borders: 1px solid #E2E8F0.
   The "Speed" Factor:
   Use slanted edges (e.g., clip-path or skew) sparingly for decorative elements.
   Progress bars and dividers should have a horizontal gradient from crh-blue to transparent to simulate motion blur.
9. Component UI Logic (Vue + Tailwind)
   The "Boarding Pass" Card:
   A vertical blue accent bar on the left.
   Hover state: The card shifts 4px to the right with a soft "motion streak" glow at the bottom.
   The "Track" Timeline:
   A 2px solid crh-blue vertical line.
   Station nodes are hollow circles that fill up as the train passes.
   Active segment: A pulsing gradient line.
   Input Fields:
   Minimalist search bars with an "Aerodynamic" rounded-full shape.
10. Output Expectation
    Please generate:
    A tailwind.config.js file with these custom tokens.
    A BaseStyle.css (or Scoped CSS) defining the "Motion Streak" animations and the Railway Track line styles.
    A set of Vue 3 functional components (Card, Badge, TimelineNode) that implement these visual rules purely through Tailwind classes.
