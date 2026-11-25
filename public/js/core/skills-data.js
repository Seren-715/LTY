// 由 anthropics/skills 生成的内置技能原文（Apache-2.0，© 2026 Anthropic, PBC.）
// frontend-design/SKILL.md 正文原样收录；theme-factory/themes/*.md 转为结构化数据。修改说明见 THIRD_PARTY_NOTICES.md

export const FRONTEND_DESIGN_DESCRIPTION = "Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults.";

export const FRONTEND_DESIGN_BODY = "# Frontend Design\n\nApproach this as the design lead at a design studio known for giving every client a distinct visual identity that is not mistaken for anyone else's. This client has already rejected proposals that felt cliché or templated, and is paying for a distinctive point of view: make deliberate, opinionated choices about palette, typography, and layout that are specific to this brief, and take aesthetic risk if justified.\n\n## Ground your designs in the subject matter\n\nIf the brief does not identify what the product or subject matter is, identify it yourself before designing, and confirm with the client. You can come up with one concrete subject, the design's audience, and the design's primary job, as a proposal. If there's any information in your memory about the client's preferences or context about what they're building, use that as a hint. The subject's industry, subject matter, materials, and vernacular are where distinctive visual choices come from — a design for a toy for girls aged 8–11 will be very aesthetically different from a dashboard for financial analysts. Build with the brief's real content and subject matter throughout.\n\n## Design principles\n\nFor web designs, the hero is the first thing viewers will see. Open with the most characteristic thing in the subject's world, in the form that is most appropriate: a headline, an image, an animation, a live demo, an interactive moment, or other treatments. Be deliberate with your choice: a big number with a small label, supporting stats, and a gradient accent is the default treatment, so only use it if that's truly the best option.\n\nTypography carries the personality of the page. You don't need a different typeface for display or headline text and body content: use one family or two, and if two, make them clearly distinct.\n\nChoose your typefaces deliberately, not the default families you would reach for on any other project, and set a clear type scale following the default guidance of The Elements of Typographic Style with intentional weights, widths, and spacing. When type is used as a headline or visual element, use the type treatment itself as an active part of the design, not a neutral delivery vehicle for the content.\n\nDefault to line lengths of less than 80 characters. Serif typefaces can have slightly longer line lengths; give serif body text slightly more line-height than a sans-serif.\n\nAvoid these default typographic treatments; they are the commonest tells of a generated page:\n- Accenting just a single word or phrase in a headline, like putting one word in italic/bold or a different color.\n- Using all caps for labels.\n- Adding unnecessary typographic labels above content.\n\nVisual structure is information. Structural devices like outlines, borders, numbering, eyebrows, dividers, labels, etc., encode useful information about the content rather than decorate it. Many generic designs use numbered markers (01 / 02 / 03), but that's only appropriate if the content actually is a sequence — like a stepped process or a timeline. Before adding numbered markers, check the content really is a sequence.\n\nUse non-user-triggered motion sparingly and deliberately, only to draw attention. A single orchestrated moment — one page-load sequence or one reveal — lands better than scattered effects; fade-and-slide-up entrances on each section and hover transitions on every card are the generic default and read as AI-generated. Motion that answers a person's action (opening, expanding, confirming) is welcome when it shows what changed.\n\nConsider written content carefully. Often a design brief may not contain real content, and it's up to you to come up with copy and placeholder content. Copy can make a design feel as templated as the design itself. See the below section on writing for more guidance.\n\n## Process: plan, review against the brief, build, critique\n\nFor calibration, AI-generated design right now clusters around some traits:\n1. a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta or warm-clay accent (often near #D97757 — Anthropic's own Claude-interaction accent, so on a user's brief it reads as a tell);\n2. a near-black background with a single bright acid-green or vermilion accent;\n3. a broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns;\n4. the SaaS-card kit: content chopped into identical rounded cards, one border-radius on everything regardless of hierarchy, the same soft grey shadow (rgba(0,0,0,.1)) under each, and gradient washes as decoration;\n5. template chrome that appears whatever the subject: a tracked-out ALL-CAPS eyebrow label above every heading; meta strings joined with middle dots ('A · B · C'); labels built as 'WORD — fragment' with a spaced em dash; tinted near-black (#0B0B0B, #111) standing in for black; a monospace face for small data labels; a '→' appended to link and button text.\n\nAll traits are legitimate for some briefs, but they are defaults rather than choices, and they appear regardless of subject. Where the brief pins down a visual direction, follow it exactly — the brief's own words always win, including when it asks for one of these looks. Where it leaves an axis free, don't spend that freedom on one of these defaults. As with a hired human designer, there's often a careful balance between doing what you're good at and taking each project as a chance to experiment and learn.\n\nWork in two passes. First, brainstorm a short design plan based on the client's design brief: create a compact token system with color, type, layout, and principles.\n- Color: describe the core base palette as 4–6 named hex values.\n- Type: the typefaces and their roles.\n- Layout: a layout concept, using one-sentence prose descriptions and ASCII wireframes to ideate and compare. Include alignment guidance; should the content be left aligned, center aligned, justified?\n- Principles: the high-level guidance for what makes this page unique.\n\nThen review that plan against the brief before building: if any part of it reads like the generic default you would produce for any similar page (work through a similar prompt to see if you arrive somewhere similar) rather than a choice made for this specific brief — revise that part, say what you changed and why. Only after you've confirmed the relative uniqueness of your design plan should you start to write the code, following the revised plan.\n\nWhen writing the code, be careful of structuring your CSS selector specificities. It's easy to generate CSS classes that cancel each other out (especially with a type-based selector like .section and an element-based selector like .cta). This can happen often with padding/margin between sections.\n\n## Restraint and self-critique\n\nSpend your boldness in one place. Let one element be the memorable thing, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief. Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected, visually accessible, harmonious color palettes. Critique your own work as you build, taking screenshots to review if your environment supports it — a picture is worth 1000 tokens. Consider Chanel's advice: before leaving the house, take a look in the mirror and remove one accessory. Human creatives have memory and always try to do something new, so if you have a space to quickly jot down notes about what you've tried, it can help you in future passes.\n\n## More on writing in design\n\nWords appear in a design for one reason: to make it easier to understand and use. They are design content, not decoration. Bring the same intentionality and minimalism to copywriting that you would bring to spacing and color. Before writing anything, ask what the design needs to say, and how it can best be said to help the person navigate the experience.\n\nWrite from the end user's perspective. Name things by what users will understand in simple language, not by how the system is built. A user manages notifications, not webhook config. Describe what something is or does in plain terms rather than selling it. Being specific and legible to new users is always better than being clever.\n\nUse active voice as default. A CTA says exactly what happens when it is used: \"Save changes,\" not \"Submit.\" An action keeps the same name through the whole flow, so the button that says \"Publish\" produces a toast that says \"Published.\" The vocabulary of an interface is the signposting for someone navigating the product. Cohesion and consistency are how people learn their way around.\n\nTreat failure and emptiness as moments for direction, not mood. Explain what went wrong and how to fix it, in the interface's voice rather than a person's. Errors don't apologize, and they are never vague about what happened. An empty screen is an invitation to act.\n\nKeep the tone conversational: plain verbs, sentence case, no filler, with tone matched to the brand and the audience. Let each written element do exactly one job.\n";

export const THEMES = [
  {
    "id": "arctic-frost",
    "name": "Arctic Frost",
    "desc": "A cool and crisp winter-inspired theme that conveys clarity, precision, and professionalism.",
    "colors": [
      {
        "name": "Ice Blue",
        "hex": "#d4e4f7",
        "role": "Light backgrounds and highlights"
      },
      {
        "name": "Steel Blue",
        "hex": "#4a6fa5",
        "role": "Primary accent color"
      },
      {
        "name": "Silver",
        "hex": "#c0c0c0",
        "role": "Metallic accent elements"
      },
      {
        "name": "Crisp White",
        "hex": "#fafafa",
        "role": "Clean backgrounds and text"
      }
    ],
    "headers": "DejaVu Sans Bold",
    "body": "DejaVu Sans",
    "best": "Healthcare presentations, technology solutions, winter sports, clean tech, pharmaceutical content.",
    "zh": "北极霜"
  },
  {
    "id": "botanical-garden",
    "name": "Botanical Garden",
    "desc": "A fresh and organic theme featuring vibrant garden-inspired colors for lively presentations.",
    "colors": [
      {
        "name": "Fern Green",
        "hex": "#4a7c59",
        "role": "Rich natural green"
      },
      {
        "name": "Marigold",
        "hex": "#f9a620",
        "role": "Bright floral accent"
      },
      {
        "name": "Terracotta",
        "hex": "#b7472a",
        "role": "Earthy warm tone"
      },
      {
        "name": "Cream",
        "hex": "#f5f3ed",
        "role": "Soft neutral backgrounds"
      }
    ],
    "headers": "DejaVu Serif Bold",
    "body": "DejaVu Sans",
    "best": "Garden centers, food presentations, farm-to-table content, botanical brands, natural products.",
    "zh": "植物园"
  },
  {
    "id": "desert-rose",
    "name": "Desert Rose",
    "desc": "A soft and sophisticated theme with dusty, muted tones perfect for elegant presentations.",
    "colors": [
      {
        "name": "Dusty Rose",
        "hex": "#d4a5a5",
        "role": "Soft primary color"
      },
      {
        "name": "Clay",
        "hex": "#b87d6d",
        "role": "Earthy accent"
      },
      {
        "name": "Sand",
        "hex": "#e8d5c4",
        "role": "Warm neutral backgrounds"
      },
      {
        "name": "Deep Burgundy",
        "hex": "#5d2e46",
        "role": "Rich dark contrast"
      }
    ],
    "headers": "FreeSans Bold",
    "body": "FreeSans",
    "best": "Fashion presentations, beauty brands, wedding planning, interior design, boutique businesses.",
    "zh": "沙漠玫瑰"
  },
  {
    "id": "forest-canopy",
    "name": "Forest Canopy",
    "desc": "A natural and grounded theme featuring earth tones inspired by dense forest environments.",
    "colors": [
      {
        "name": "Forest Green",
        "hex": "#2d4a2b",
        "role": "Primary dark green"
      },
      {
        "name": "Sage",
        "hex": "#7d8471",
        "role": "Muted green accent"
      },
      {
        "name": "Olive",
        "hex": "#a4ac86",
        "role": "Light accent color"
      },
      {
        "name": "Ivory",
        "hex": "#faf9f6",
        "role": "Backgrounds and text"
      }
    ],
    "headers": "FreeSerif Bold",
    "body": "FreeSans",
    "best": "Environmental presentations, sustainability reports, outdoor brands, wellness content, organic products.",
    "zh": "森林"
  },
  {
    "id": "golden-hour",
    "name": "Golden Hour",
    "desc": "A rich and warm autumnal palette that creates an inviting and sophisticated atmosphere.",
    "colors": [
      {
        "name": "Mustard Yellow",
        "hex": "#f4a900",
        "role": "Bold primary accent"
      },
      {
        "name": "Terracotta",
        "hex": "#c1666b",
        "role": "Warm secondary color"
      },
      {
        "name": "Warm Beige",
        "hex": "#d4b896",
        "role": "Neutral backgrounds"
      },
      {
        "name": "Chocolate Brown",
        "hex": "#4a403a",
        "role": "Dark text and anchors"
      }
    ],
    "headers": "FreeSans Bold",
    "body": "FreeSans",
    "best": "Restaurant presentations, hospitality brands, fall campaigns, cozy lifestyle content, artisan products.",
    "zh": "黄金时刻"
  },
  {
    "id": "midnight-galaxy",
    "name": "Midnight Galaxy",
    "desc": "A dramatic and cosmic theme with deep purples and mystical tones for impactful presentations.",
    "colors": [
      {
        "name": "Deep Purple",
        "hex": "#2b1e3e",
        "role": "Rich dark base"
      },
      {
        "name": "Cosmic Blue",
        "hex": "#4a4e8f",
        "role": "Mystical mid-tone"
      },
      {
        "name": "Lavender",
        "hex": "#a490c2",
        "role": "Soft accent color"
      },
      {
        "name": "Silver",
        "hex": "#e6e6fa",
        "role": "Light highlights and text"
      }
    ],
    "headers": "FreeSans Bold",
    "body": "FreeSans",
    "best": "Entertainment industry, gaming presentations, nightlife venues, luxury brands, creative agencies.",
    "zh": "午夜星河"
  },
  {
    "id": "modern-minimalist",
    "name": "Modern Minimalist",
    "desc": "A clean and contemporary theme with a sophisticated grayscale palette for maximum versatility.",
    "colors": [
      {
        "name": "Charcoal",
        "hex": "#36454f",
        "role": "Primary dark color"
      },
      {
        "name": "Slate Gray",
        "hex": "#708090",
        "role": "Medium gray for accents"
      },
      {
        "name": "Light Gray",
        "hex": "#d3d3d3",
        "role": "Backgrounds and dividers"
      },
      {
        "name": "White",
        "hex": "#ffffff",
        "role": "Text and clean backgrounds"
      }
    ],
    "headers": "DejaVu Sans Bold",
    "body": "DejaVu Sans",
    "best": "Tech presentations, architecture portfolios, design showcases, modern business proposals, data visualization.",
    "zh": "现代极简"
  },
  {
    "id": "ocean-depths",
    "name": "Ocean Depths",
    "desc": "A professional and calming maritime theme that evokes the serenity of deep ocean waters.",
    "colors": [
      {
        "name": "Deep Navy",
        "hex": "#1a2332",
        "role": "Primary background color"
      },
      {
        "name": "Teal",
        "hex": "#2d8b8b",
        "role": "Accent color for highlights and emphasis"
      },
      {
        "name": "Seafoam",
        "hex": "#a8dadc",
        "role": "Secondary accent for lighter elements"
      },
      {
        "name": "Cream",
        "hex": "#f1faee",
        "role": "Text and light backgrounds"
      }
    ],
    "headers": "DejaVu Sans Bold",
    "body": "DejaVu Sans",
    "best": "Corporate presentations, financial reports, professional consulting decks, trust-building content.",
    "zh": "深海"
  },
  {
    "id": "sunset-boulevard",
    "name": "Sunset Boulevard",
    "desc": "A warm and vibrant theme inspired by golden hour sunsets, perfect for energetic and creative presentations.",
    "colors": [
      {
        "name": "Burnt Orange",
        "hex": "#e76f51",
        "role": "Primary accent color"
      },
      {
        "name": "Coral",
        "hex": "#f4a261",
        "role": "Secondary warm accent"
      },
      {
        "name": "Warm Sand",
        "hex": "#e9c46a",
        "role": "Highlighting and backgrounds"
      },
      {
        "name": "Deep Purple",
        "hex": "#264653",
        "role": "Dark contrast and text"
      }
    ],
    "headers": "DejaVu Serif Bold",
    "body": "DejaVu Sans",
    "best": "Creative pitches, marketing presentations, lifestyle brands, event promotions, inspirational content.",
    "zh": "日落大道"
  },
  {
    "id": "tech-innovation",
    "name": "Tech Innovation",
    "desc": "A bold and modern theme with high-contrast colors perfect for cutting-edge technology presentations.",
    "colors": [
      {
        "name": "Electric Blue",
        "hex": "#0066ff",
        "role": "Vibrant primary accent"
      },
      {
        "name": "Neon Cyan",
        "hex": "#00ffff",
        "role": "Bright highlight color"
      },
      {
        "name": "Dark Gray",
        "hex": "#1e1e1e",
        "role": "Deep backgrounds"
      },
      {
        "name": "White",
        "hex": "#ffffff",
        "role": "Clean text and contrast"
      }
    ],
    "headers": "DejaVu Sans Bold",
    "body": "DejaVu Sans",
    "best": "Tech startups, software launches, innovation showcases, AI/ML presentations, digital transformation content.",
    "zh": "科技创新"
  }
];
