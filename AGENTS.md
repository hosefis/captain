# Agent.md

## General rules

- When writing try to avoid nesting over 3 depth nest. Prefer extraction and inversion as much as possible when it make sense.
- Avoid unecessary complex code for the sake of complexity prefer simple implementation that achieve the same result without sacrifiscing performance or goals
- It's fine to have repeated code go more for a "Repeat until good" and "YAGNI" principle and mentality rather than a "Don't Repeat Yourself" one.
- Avoid barrel files.

## Comment rule

- Avoid unecessary comment prefer better written and self explaining code. The code intent should be clear enough to be understable without any comment.
- Make sure to write documentation. Their goals is to be short description explaining the function/class/method/API intent and what it represent
- Comment are ok for two reason non obvious performance optimization and references to maths or algorithms

## Rule for naming things

- Don't abbreviate names
- Add units to variables names unless the type tell you
- Don't put types in variables names
- Refactor if you find yourself naming code "Utils" or "Helper"
