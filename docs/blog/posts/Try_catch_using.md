---
date: 2025-03-28
readtime: 10
categories:
  - Game Development
  - Programming
authors:
  - tianle
comments: true
---

# Goal of using `Try-catch`

> "`Try-catch` should never replace proper control flow. Don’t use it to handle null references or check for empty lists. It’s not meant for regular logic — it’s <u>meant for unpredictable failures like file I/O, networking, reflection, or untrusted input</u>."

<!-- more -->

Above is what I got from [LinkedIn Post](https://www.linkedin.com/posts/abhisheketh_gamedev-programming-code-activity-7310662695081365504-7WFc?utm_source=share&utm_medium=member_desktop&rcm=ACoAADaDCvsBb-J9qFGjgvr5zPCGJSwTxsqOD-g). 
<br>
As we all know in the development for a product, `Try-catch` normally is not used for fixing mistakes — we use it to handle failure gracefully.

- log the error
- recover with default values
- continue running—without impacting the player experience.

But the head paragraph highlighted the most important point: **`Try-catch` is for unpredictable failures**. It is not for fixing mistakes.
<br>
Additionally, here are some other critial thoughts: 

- If you <u>never use `Try-catch`, you are wasting time</u> on debugging. 
- But you <u>also don't want to wrap your entire code base in try catch blocks (sometimes it happen). Having your program fail is sometimes desirable,</u> since allowing your code to continue running when it shouldn't, can cause problem.
