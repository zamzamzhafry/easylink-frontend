# QA Feedback — EasyLink Frontend

> **How to use this file**
> Work through each section top to bottom. For every test case:
>
> - Tick `[x]` if it passes
> - Leave `[ ]` and write your finding in the **Feedback / Bug** column
> - Use the free-form **Notes** block at the bottom of each section for anything that doesn't fit a row
> - When done, set the **Section verdict** to `PASS`, `FAIL`, or `PARTIAL`

---

## Session Info

| Field          | Value   |
| -------------- | ------- |
| Tester         |         |
| Date           |         |
| Build / commit |         |
| Browser        |         |
| OS             |         |
| Role(s) tested | `admin` |
| SDK connected? | `no`    |
| Locale tested  | `both`  |

---

## 1. Auth

| #   | Test                                                     | Pass? | Feedback / Bug |
| --- | -------------------------------------------------------- | ----- | -------------- |
| 1.1 | Visit `/` unauthenticated → redirects to `/login`        | `[x]` |                |
| 1.2 | Wrong password → error shown, no redirect                | `[x]` |                |
| 1.3 | Login as **admin** → full nav, dashboard loads           | `[x]` |                |
| 1.4 | Login as **group_leader** → limited nav, dashboard loads | `[ ]` |                |
| 1.5 | Login as **employee** → minimal nav, dashboard loads     | `[ ]` |
| 1.6 | Logout → session cleared, back to `/login`               | `[x]` |                |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**

```
(write anything here)
```

---

## 2. Dashboard (`/`)

| #   | Test                                          | Pass? | Feedback / Bug |
| --- | --------------------------------------------- | ----- | -------------- |
| 2.1 | Stat cards render without JS errors           | `[x]` |                |
| 2.2 | Admin sees all-employee stats                 | `[x]` |                |
| 2.3 | Group leader stats scoped to their groups     | `[ ]` |                |
| 2.4 | Employee stats scoped to own data             | `[ ]` |                |
| 2.5 | Recent scans table loads, timestamps readable | `[x]` |                |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
would be nice if app-shell-main min-h-screen p-6 transition-all duration-200 ml-60 xl:mr-80 on right side bar on fold is overlay and the space for app shell main is full widht fill the screen overflow. and right side bar is above the app main shell.

```
Make this unloaded at init and only hit refresh loading the compinent. make it unactive first

871-904d3a07d562c18e.js:1  GET http://localhost:3000/api/ops/recovery 500 (Internal Server Error)


Compiled /api/ops/recovery in 180ms (586 modules)
Recovery status error: Error: Command failed: powershell.exe -NoProfile -NonInteractive -EncodedCommand CgAgACAAIAAgACQAdABhAHMAawBOAGEAbQBlACAAPQAgACcARQBhAHMAeQBMAGkAbgBrAC0AUgBlAGMAbwB2AGUAcgB5ACcACgAgACAAIAAgACQAdABhAHMAawBQAGEAdABoACAAPQAgACcAXAAnAAoAIAAgACAAIAAkAHQAYQBzAGsAIAA9ACAARwBlAHQALQBTAGMAaABlAGQAdQBsAGUAZABUAGEAcwBrACAALQBUAGEAcwBrAE4AYQBtAGUAIAAkAHQAYQBzAGsATgBhAG0AZQAgAC0AVABhAHMAawBQAGEAdABoACAAJAB0AGEAcwBrAFAAYQB0AGgAIAAtAEUAcgByAG8AcgBBAGMAdABpAG8AbgAgAFMAdABvAHAACgAgACAAIAAgACQAaQBuAGYAbwAgAD0AIAAkAHQAYQBzAGsAIAB8ACAARwBlAHQALQBTAGMAaABlAGQAdQBsAGUAZABUAGEAcwBrAEkAbgBmAG8ACgAgACAAIAAgAFsAcABzAGMAdQBzAHQAbwBtAG8AYgBqAGUAYwB0AF0AQAB7AAoAIAAgACAAIAAgACAAbgBhAG0AZQAgAD0AIAAkAHQAYQBzAGsALgBUAGEAcwBrAE4AYQBtAGUACgAgACAAIAAgACAAIABwAGEAdABoACAAPQAgACQAdABhAHMAawAuAFQAYQBzAGsAUABhAHQAaAAKACAAIAAgACAAIAAgAHMAdABhAHQAZQAgAD0AIABbAHMAdAByAGkAbgBnAF0AJAB0AGEAcwBrAC4AUwB0AGEAdABlAAoAIAAgACAAIAAgACAAbABhAHMAdABSAHUAbgBUAGkAbQBlACAAPQAgAGkAZgAgACgAJABpAG4AZgBvAC4ATABhAHMAdABSAHUAbgBUAGkAbQBlACAALQBhAG4AZAAgACQAaQBuAGYAbwAuAEwAYQBzAHQAUgB1AG4AVABpAG0AZQAuAFkAZQBhAHIAIAAtAGcAdAAgADEAOQAwADAAKQAgAHsAIAAkAGkAbgBmAG8ALgBMAGEAcwB0AFIAdQBuAFQAaQBtAGUALgBUAG8AUwB0AHIAaQBuAGcAKAAnAG8AJwApACAAfQAgAGUAbABzAGUAIAB7ACAAJABuAHUAbABsACAAfQAKACAAIAAgACAAIAAgAG4AZQB4AHQAUgB1AG4AVABpAG0AZQAgAD0AIABpAGYAIAAoACQAaQBuAGYAbwAuAE4AZQB4AHQAUgB1AG4AVABpAG0AZQAgAC0AYQBuAGQAIAAkAGkAbgBmAG8ALgBOAGUAeAB0AFIAdQBuAFQAaQBtAGUALgBZAGUAYQByACAALQBnAHQAIAAxADkAMAAwACkAIAB7ACAAJABpAG4AZgBvAC4ATgBlAHgAdABSAHUAbgBUAGkAbQBlAC4AVABvAFMAdAByAGkAbgBnACgAJwBvACcAKQAgAH0AIABlAGwAcwBlACAAewAgACQAbgB1AGwAbAAgAH0ACgAgACAAIAAgACAAIABsAGEAcwB0AFQAYQBzAGsAUgBlAHMAdQBsAHQAIAA9ACAAJABpAG4AZgBvAC4ATABhAHMAdABUAGEAcwBrAFIAZQBzAHUAbAB0AAoAIAAgACAAIAB9ACAAfAAgAEMAbwBuAHYAZQByAHQAVABvAC0ASgBzAG8AbgAgAC0AQwBvAG0AcAByAGUAcwBzAAoAIAAgAA==
#< CLIXML
<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04"><Obj S="progress" RefId="0"><TN RefId="0"><T>System.Management.Automation.PSCustomObject</T><T>System.Object</T></TN><MS><I64 N="SourceId">1</I64><PR N="Record"><AV>Preparing modules for first use.</AV><AI>0</AI><Nil /><PI>-1</PI><PC>-1</PC><T>Completed</T><SR>-1</SR><SD> </SD></PR></MS></Obj><S S="Error">Get-ScheduledTask : No matching MSFT_ScheduledTask objects found by CIM query for instances of the _x000D__x000A_</S><S S="Error">Root/Microsoft/Windows/TaskScheduler/MSFT_ScheduledTask class on the  CIM server: SELECT * FROM MSFT_ScheduledTask  _x000D__x000A_</S><S S="Error">WHERE ((TaskName LIKE 'EasyLink-Recovery')) AND ((TaskPath LIKE '\\')). Verify query parameters and retry._x000D__x000A_</S><S S="Error">At line:4 char:13_x000D__x000A_</S><S S="Error">+     $task = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath ..._x000D__x000A_</S><S S="Error">+             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~_x000D__x000A_</S><S S="Error">    + CategoryInfo          : ObjectNotFound: (MSFT_ScheduledTask:String) [Get-ScheduledTask], CimJobException_x000D__x000A_</S><S S="Error">    + FullyQualifiedErrorId : CmdletizationQuery_NotFound,Get-ScheduledTask_x000D__x000A_</S><S S="Error"> _x000D__x000A_</S></Objs>
    at genericNodeError (node:internal/errors:985:15)
    at wrappedFn (node:internal/errors:539:14)
    at ChildProcess.exithandler (node:child_process:417:12)
    at ChildProcess.emit (node:events:508:28)
    at maybeClose (node:internal/child_process:1101:16)
    at ChildProcess._handle.onexit (node:internal/child_process:305:5) {
  code: 1,
  killed: false,
  signal: null,
  cmd: 'powershell.exe -NoProfile -NonInteractive -EncodedCommand CgAgACAAIAAgACQAdABhAHMAawBOAGEAbQBlACAAPQAgACcARQBhAHMAeQBMAGkAbgBrAC0AUgBlAGMAbwB2AGUAcgB5ACcACgAgACAAIAAgACQAdABhAHMAawBQAGEAdABoACAAPQAgACcAXAAnAAoAIAAgACAAIAAkAHQAYQBzAGsAIAA9ACAARwBlAHQALQBTAGMAaABlAGQAdQBsAGUAZABUAGEAcwBrACAALQBUAGEAcwBrAE4AYQBtAGUAIAAkAHQAYQBzAGsATgBhAG0AZQAgAC0AVABhAHMAawBQAGEAdABoACAAJAB0AGEAcwBrAFAAYQB0AGgAIAAtAEUAcgByAG8AcgBBAGMAdABpAG8AbgAgAFMAdABvAHAACgAgACAAIAAgACQAaQBuAGYAbwAgAD0AIAAkAHQAYQBzAGsAIAB8ACAARwBlAHQALQBTAGMAaABlAGQAdQBsAGUAZABUAGEAcwBrAEkAbgBmAG8ACgAgACAAIAAgAFsAcABzAGMAdQBzAHQAbwBtAG8AYgBqAGUAYwB0AF0AQAB7AAoAIAAgACAAIAAgACAAbgBhAG0AZQAgAD0AIAAkAHQAYQBzAGsALgBUAGEAcwBrAE4AYQBtAGUACgAgACAAIAAgACAAIABwAGEAdABoACAAPQAgACQAdABhAHMAawAuAFQAYQBzAGsAUABhAHQAaAAKACAAIAAgACAAIAAgAHMAdABhAHQAZQAgAD0AIABbAHMAdAByAGkAbgBnAF0AJAB0AGEAcwBrAC4AUwB0AGEAdABlAAoAIAAgACAAIAAgACAAbABhAHMAdABSAHUAbgBUAGkAbQBlACAAPQAgAGkAZgAgACgAJABpAG4AZgBvAC4ATABhAHMAdABSAHUAbgBUAGkAbQBlACAALQBhAG4AZAAgACQAaQBuAGYAbwAuAEwAYQBzAHQAUgB1AG4AVABpAG0AZQAuAFkAZQBhAHIAIAAtAGcAdAAgADEAOQAwADAAKQAgAHsAIAAkAGkAbgBmAG8ALgBMAGEAcwB0AFIAdQBuAFQAaQBtAGUALgBUAG8AUwB0AHIAaQBuAGcAKAAnAG8AJwApACAAfQAgAGUAbABzAGUAIAB7ACAAJABuAHUAbABsACAAfQAKACAAIAAgACAAIAAgAG4AZQB4AHQAUgB1AG4AVABpAG0AZQAgAD0AIABpAGYAIAAoACQAaQBuAGYAbwAuAE4AZQB4AHQAUgB1AG4AVABpAG0AZQAgAC0AYQBuAGQAIAAkAGkAbgBmAG8ALgBOAGUAeAB0AFIAdQBuAFQAaQBtAGUALgBZAGUAYQByACAALQBnAHQAIAAxADkAMAAwACkAIAB7ACAAJABpAG4AZgBvAC4ATgBlAHgAdABSAHUAbgBUAGkAbQBlAC4AVABvAFMAdAByAGkAbgBnACgAJwBvACcAKQAgAH0AIABlAGwAcwBlACAAewAgACQAbgB1AGwAbAAgAH0ACgAgACAAIAAgACAAIABsAGEAcwB0AFQAYQBzAGsAUgBlAHMAdQBsAHQAIAA9ACAAJABpAG4AZgBvAC4ATABhAHMAdABUAGEAcwBrAFIAZQBzAHUAbAB0AAoAIAAgACAAIAB9ACAAfAAgAEMAbwBuAHYAZQByAHQAVABvAC0ASgBzAG8AbgAgAC0AQwBvAG0AcAByAGUAcwBzAAoAIAAgAA==',
  stdout: '',
  stderr: '#< CLIXML\r\n' +
    `<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04"><Obj S="progress" RefId="0"><TN RefId="0"><T>System.Management.Automation.PSCustomObject</T><T>System.Object</T></TN><MS><I64 N="SourceId">1</I64><PR N="Record"><AV>Preparing modules for first use.</AV><AI>0</AI><Nil /><PI>-1</PI><PC>-1</PC><T>Completed</T><SR>-1</SR><SD> </SD></PR></MS></Obj><S S="Error">Get-ScheduledTask : No matching MSFT_ScheduledTask objects found by CIM query for instances of the _x000D__x000A_</S><S S="Error">Root/Microsoft/Windows/TaskScheduler/MSFT_ScheduledTask class on the  CIM server: SELECT * FROM MSFT_ScheduledTask  _x000D__x000A_</S><S S="Error">WHERE ((TaskName LIKE 'EasyLink-Recovery')) AND ((TaskPath LIKE '\\\\')). Verify query parameters and retry._x000D__x000A_</S><S S="Error">At line:4 char:13_x000D__x000A_</S><S S="Error">+     $task = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath ..._x000D__x000A_</S><S S="Error">+             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~_x000D__x000A_</S><S S="Error">    + CategoryInfo          : ObjectNotFound: (MSFT_ScheduledTask:String) [Get-ScheduledTask], CimJobException_x000D__x000A_</S><S S="Error">    + FullyQualifiedErrorId : CmdletizationQuery_NotFound,Get-ScheduledTask_x000D__x000A_</S><S S="Error"> _x000D__x000A_</S></Objs>`
}
 GET /api/ops/recovery 500 in 6019ms
Recovery status error: Error: Command failed: powershell.exe -NoProfile -NonInteractive -EncodedCommand CgAgACAAIAAgACQAdABhAHMAawBOAGEAbQBlACAAPQAgACcARQBhAHMAeQBMAGkAbgBrAC0AUgBlAGMAbwB2AGUAcgB5ACcACgAgACAAIAAgACQAdABhAHMAawBQAGEAdABoACAAPQAgACcAXAAnAAoAIAAgACAAIAAkAHQAYQBzAGsAIAA9ACAARwBlAHQALQBTAGMAaABlAGQAdQBsAGUAZABUAGEAcwBrACAALQBUAGEAcwBrAE4AYQBtAGUAIAAkAHQAYQBzAGsATgBhAG0AZQAgAC0AVABhAHMAawBQAGEAdABoACAAJAB0AGEAcwBrAFAAYQB0AGgAIAAtAEUAcgByAG8AcgBBAGMAdABpAG8AbgAgAFMAdABvAHAACgAgACAAIAAgACQAaQBuAGYAbwAgAD0AIAAkAHQAYQBzAGsAIAB8ACAARwBlAHQALQBTAGMAaABlAGQAdQBsAGUAZABUAGEAcwBrAEkAbgBmAG8ACgAgACAAIAAgAFsAcABzAGMAdQBzAHQAbwBtAG8AYgBqAGUAYwB0AF0AQAB7AAoAIAAgACAAIAAgACAAbgBhAG0AZQAgAD0AIAAkAHQAYQBzAGsALgBUAGEAcwBrAE4AYQBtAGUACgAgACAAIAAgACAAIABwAGEAdABoACAAPQAgACQAdABhAHMAawAuAFQAYQBzAGsAUABhAHQAaAAKACAAIAAgACAAIAAgAHMAdABhAHQAZQAgAD0AIABbAHMAdAByAGkAbgBnAF0AJAB0AGEAcwBrAC4AUwB0AGEAdABlAAoAIAAgACAAIAAgACAAbABhAHMAdABSAHUAbgBUAGkAbQBlACAAPQAgAGkAZgAgACgAJABpAG4AZgBvAC4ATABhAHMAdABSAHUAbgBUAGkAbQBlACAALQBhAG4AZAAgACQAaQBuAGYAbwAuAEwAYQBzAHQAUgB1AG4AVABpAG0AZQAuAFkAZQBhAHIAIAAtAGcAdAAgADEAOQAwADAAKQAgAHsAIAAkAGkAbgBmAG8ALgBMAGEAcwB0AFIAdQBuAFQAaQBtAGUALgBUAG8AUwB0AHIAaQBuAGcAKAAnAG8AJwApACAAfQAgAGUAbABzAGUAIAB7ACAAJABuAHUAbABsACAAfQAKACAAIAAgACAAIAAgAG4AZQB4AHQAUgB1AG4AVABpAG0AZQAgAD0AIABpAGYAIAAoACQAaQBuAGYAbwAuAE4AZQB4AHQAUgB1AG4AVABpAG0AZQAgAC0AYQBuAGQAIAAkAGkAbgBmAG8ALgBOAGUAeAB0AFIAdQBuAFQAaQBtAGUALgBZAGUAYQByACAALQBnAHQAIAAxADkAMAAwACkAIAB7ACAAJABpAG4AZgBvAC4ATgBlAHgAdABSAHUAbgBUAGkAbQBlAC4AVABvAFMAdAByAGkAbgBnACgAJwBvACcAKQAgAH0AIABlAGwAcwBlACAAewAgACQAbgB1AGwAbAAgAH0ACgAgACAAIAAgACAAIABsAGEAcwB0AFQAYQBzAGsAUgBlAHMAdQBsAHQAIAA9ACAAJABpAG4AZgBvAC4ATABhAHMAdABUAGEAcwBrAFIAZQBzAHUAbAB0AAoAIAAgACAAIAB9ACAAfAAgAEMAbwBuAHYAZQByAHQAVABvAC0ASgBzAG8AbgAgAC0AQwBvAG0AcAByAGUAcwBzAAoAIAAgAA==
#< CLIXML
<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04"><Obj S="progress" RefId="0"><TN RefId="0"><T>System.Management.Automation.PSCustomObject</T><T>System.Object</T></TN><MS><I64 N="SourceId">1</I64><PR N="Record"><AV>Preparing modules for first use.</AV><AI>0</AI><Nil /><PI>-1</PI><PC>-1</PC><T>Completed</T><SR>-1</SR><SD> </SD></PR></MS></Obj><S S="Error">Get-ScheduledTask : No matching MSFT_ScheduledTask objects found by CIM query for instances of the _x000D__x000A_</S><S S="Error">Root/Microsoft/Windows/TaskScheduler/MSFT_ScheduledTask class on the  CIM server: SELECT * FROM MSFT_ScheduledTask  _x000D__x000A_</S><S S="Error">WHERE ((TaskName LIKE 'EasyLink-Recovery')) AND ((TaskPath LIKE '\\')). Verify query parameters and retry._x000D__x000A_</S><S S="Error">At line:4 char:13_x000D__x000A_</S><S S="Error">+     $task = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath ..._x000D__x000A_</S><S S="Error">+             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~_x000D__x000A_</S><S S="Error">    + CategoryInfo          : ObjectNotFound: (MSFT_ScheduledTask:String) [Get-ScheduledTask], CimJobException_x000D__x000A_</S><S S="Error">    + FullyQualifiedErrorId : CmdletizationQuery_NotFound,Get-ScheduledTask_x000D__x000A_</S><S S="Error"> _x000D__x000A_</S></Objs>
    at genericNodeError (node:internal/errors:985:15)
    at wrappedFn (node:internal/errors:539:14)
    at ChildProcess.exithandler (node:child_process:417:12)
    at ChildProcess.emit (node:events:508:28)
    at maybeClose (node:internal/child_process:1101:16)
    at ChildProcess._handle.onexit (node:internal/child_process:305:5) {
  code: 1,
  killed: false,
  signal: null,
  cmd: 'powershell.exe -NoProfile -NonInteractive -EncodedCommand CgAgACAAIAAgACQAdABhAHMAawBOAGEAbQBlACAAPQAgACcARQBhAHMAeQBMAGkAbgBrAC0AUgBlAGMAbwB2AGUAcgB5ACcACgAgACAAIAAgACQAdABhAHMAawBQAGEAdABoACAAPQAgACcAXAAnAAoAIAAgACAAIAAkAHQAYQBzAGsAIAA9ACAARwBlAHQALQBTAGMAaABlAGQAdQBsAGUAZABUAGEAcwBrACAALQBUAGEAcwBrAE4AYQBtAGUAIAAkAHQAYQBzAGsATgBhAG0AZQAgAC0AVABhAHMAawBQAGEAdABoACAAJAB0AGEAcwBrAFAAYQB0AGgAIAAtAEUAcgByAG8AcgBBAGMAdABpAG8AbgAgAFMAdABvAHAACgAgACAAIAAgACQAaQBuAGYAbwAgAD0AIAAkAHQAYQBzAGsAIAB8ACAARwBlAHQALQBTAGMAaABlAGQAdQBsAGUAZABUAGEAcwBrAEkAbgBmAG8ACgAgACAAIAAgAFsAcABzAGMAdQBzAHQAbwBtAG8AYgBqAGUAYwB0AF0AQAB7AAoAIAAgACAAIAAgACAAbgBhAG0AZQAgAD0AIAAkAHQAYQBzAGsALgBUAGEAcwBrAE4AYQBtAGUACgAgACAAIAAgACAAIABwAGEAdABoACAAPQAgACQAdABhAHMAawAuAFQAYQBzAGsAUABhAHQAaAAKACAAIAAgACAAIAAgAHMAdABhAHQAZQAgAD0AIABbAHMAdAByAGkAbgBnAF0AJAB0AGEAcwBrAC4AUwB0AGEAdABlAAoAIAAgACAAIAAgACAAbABhAHMAdABSAHUAbgBUAGkAbQBlACAAPQAgAGkAZgAgACgAJABpAG4AZgBvAC4ATABhAHMAdABSAHUAbgBUAGkAbQBlACAALQBhAG4AZAAgACQAaQBuAGYAbwAuAEwAYQBzAHQAUgB1AG4AVABpAG0AZQAuAFkAZQBhAHIAIAAtAGcAdAAgADEAOQAwADAAKQAgAHsAIAAkAGkAbgBmAG8ALgBMAGEAcwB0AFIAdQBuAFQAaQBtAGUALgBUAG8AUwB0AHIAaQBuAGcAKAAnAG8AJwApACAAfQAgAGUAbABzAGUAIAB7ACAAJABuAHUAbABsACAAfQAKACAAIAAgACAAIAAgAG4AZQB4AHQAUgB1AG4AVABpAG0AZQAgAD0AIABpAGYAIAAoACQAaQBuAGYAbwAuAE4AZQB4AHQAUgB1AG4AVABpAG0AZQAgAC0AYQBuAGQAIAAkAGkAbgBmAG8ALgBOAGUAeAB0AFIAdQBuAFQAaQBtAGUALgBZAGUAYQByACAALQBnAHQAIAAxADkAMAAwACkAIAB7ACAAJABpAG4AZgBvAC4ATgBlAHgAdABSAHUAbgBUAGkAbQBlAC4AVABvAFMAdAByAGkAbgBnACgAJwBvACcAKQAgAH0AIABlAGwAcwBlACAAewAgACQAbgB1AGwAbAAgAH0ACgAgACAAIAAgACAAIABsAGEAcwB0AFQAYQBzAGsAUgBlAHMAdQBsAHQAIAA9ACAAJABpAG4AZgBvAC4ATABhAHMAdABUAGEAcwBrAFIAZQBzAHUAbAB0AAoAIAAgACAAIAB9ACAAfAAgAEMAbwBuAHYAZQByAHQAVABvAC0ASgBzAG8AbgAgAC0AQwBvAG0AcAByAGUAcwBzAAoAIAAgAA==',
  stdout: '',
  stderr: '#< CLIXML\r\n' +
    `<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04"><Obj S="progress" RefId="0"><TN RefId="0"><T>System.Management.Automation.PSCustomObject</T><T>System.Object</T></TN><MS><I64 N="SourceId">1</I64><PR N="Record"><AV>Preparing modules for first use.</AV><AI>0</AI><Nil /><PI>-1</PI><PC>-1</PC><T>Completed</T><SR>-1</SR><SD> </SD></PR></MS></Obj><S S="Error">Get-ScheduledTask : No matching MSFT_ScheduledTask objects found by CIM query for instances of the _x000D__x000A_</S><S S="Error">Root/Microsoft/Windows/TaskScheduler/MSFT_ScheduledTask class on the  CIM server: SELECT * FROM MSFT_ScheduledTask  _x000D__x000A_</S><S S="Error">WHERE ((TaskName LIKE 'EasyLink-Recovery')) AND ((TaskPath LIKE '\\\\')). Verify query parameters and retry._x000D__x000A_</S><S S="Error">At line:4 char:13_x000D__x000A_</S><S S="Error">+     $task = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath ..._x000D__x000A_</S><S S="Error">+             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~_x000D__x000A_</S><S S="Error">    + CategoryInfo          : ObjectNotFound: (MSFT_ScheduledTask:String) [Get-ScheduledTask], CimJobException_x000D__x000A_</S><S S="Error">    + FullyQualifiedErrorId : CmdletizationQuery_NotFound,Get-ScheduledTask_x000D__x000A_</S><S S="Error"> _x000D__x000A_</S></Objs>`
}
 GET /api/ops/recovery 500 in 2724ms
```

---

## 3. Attendance (`/attendance`)

| #   | Test                                                 | Pass? | Feedback / Bug |
| --- | ---------------------------------------------------- | ----- | -------------- |
| 3.1 | Admin sees all employees                             | `[x]` |                |
| 3.2 | Group leader sees only their group members           | `[ ]` |                |
| 3.3 | Employee sees only own records                       | `[ ]` |                |
| 3.4 | Date range filter re-fetches correctly               | `[x]` |                |
| 3.5 | Pagination — page size selector works                | `[x]` |                |
| 3.6 | Pagination — prev / next work                        | `[x]` |                |
| 3.7 | Anomaly flags (late / early leave) visible for admin | `[x]` |                |
| 3.8 | Notes editor visible for admin, hidden for non-admin | `[ ]` |                |
| 3.9 | Quick summaries cards load without error             | `[x]` |                |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**

if some one has long names and titles like "Akbar Waskitojati Pamungkas,S.Tr.Kes". and broken the table cell margin. i want to trimmed like "Akbar Waskito..." to hardening the space between cell.

Admin operations sidebar on fold should make app main shell using full width of screen

```

---

## 4. Attendance Review (`/attendance/review`)

| #   | Test                                | Pass? | Feedback / Bug |
| --- | ----------------------------------- | ----- | -------------- |
| 4.1 | Admin can access review queue       | `[x]` |                |
| 4.2 | Non-admin gets 403 / redirect       | `[ ]` |                |
| 4.3 | Approve a revision → status updates | `[ ]` |                |
| 4.4 | Reject a revision → status updates  | `[ ]` |                |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**


not testing the rest. should add filter for quick date range filter like this week. this month and last month. and then has a filter of anomaly etc incluceded like checkboxes. im not testing the rest maybe later
```

```

---

## 5. Report (`/report`)

| #    | Test                                               | Pass? | Feedback / Bug |
| ---- | -------------------------------------------------- | ----- | -------------- |
| 5.1  | Pie chart renders with status breakdown            | `[ ]` |                |
| 5.2  | Bar chart renders with monthly data                | `[ ]` |                |
| 5.3  | Monthly target line visible on bar chart           | `[ ]` |                |
| 5.4  | Target line labeled "(global config)"              | `[ ]` |                |
| 5.5  | Click pie slice → drilldown filters to that status | `[ ]` |                |
| 5.6  | Drilldown pagination works                         | `[ ]` |                |
| 5.7  | Admin drilldown shows discipline columns           | `[ ]` |                |
| 5.8  | Non-admin drilldown hides discipline columns       | `[ ]` |                |
| 5.9  | Group filter changes chart data                    | `[ ]` |                |
| 5.10 | CSV export downloads with correct headers          | `[ ]` |                |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**

no visible access button to the pages. add to left sidebar too

the selection is far less than employee. should be all employee all group check query. i check more later

```

```

---

## 6. Machine (`/machine`)

| #   | Test                                                                     | Pass? | Feedback / Bug |
| --- | ------------------------------------------------------------------------ | ----- | -------------- |
| 6.1 | No SDK env vars → page loads, shows grey "Not Configured" pill           | `[ ]` |                |
| 6.2 | No SDK env vars → no uncaught errors in browser console                  | `[ ]` |                |
| 6.3 | No SDK env vars → 15s status poll fires silently (no error toast)        | `[ ]` |                |
| 6.4 | No SDK env vars → queuing an action shows "SDK not configured" error     | `[ ]` |                |
| 6.5 | Non-admin → warning banner shown, all action panels hidden               | `[ ]` |                |
| 6.6 | SDK connected → connection card shows correct status (online / degraded) | `[ ]` |                |
| 6.7 | Queue an action (info / time) → job appears in job list                  | `[ ]` |                |
| 6.8 | Job polling → status updates to success / failed                         | `[ ]` |                |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**

not checking because no machine connect rn. might want to use different approach using PHP curl or curl powershell script

```

---

## 7. Employees (`/employees`)

| #   | Test                                           | Pass? | Feedback / Bug |
| --- | ---------------------------------------------- | ----- | -------------- |
| 7.1 | Employee list renders                          | `[x]` |                |
| 7.2 | Link employee to device user — save succeeds   | `[x]` |                |
| 7.3 | Employee detail page loads (`/employees/[id]`) | `[x]` |                |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**

kinda good just column data detail might be provided later

```

```

---

## 8. Groups (`/groups`)

| #   | Test                                          | Pass? | Feedback / Bug |
| --- | --------------------------------------------- | ----- | -------------- |
| 8.1 | Groups list renders                           | `x ]` |                |
| 8.2 | Create group → appears in list                | `[x]` |                |
| 8.3 | Assign employee to group → persists on reload | `[x]` |                |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**

```
good crud
```

---

## 9. Schedule (`/schedule`)

| #   | Test                                | Pass? | Feedback / Bug |
| --- | ----------------------------------- | ----- | -------------- |
| 9.1 | Weekly calendar renders shift cells | `[x]` |                |
| 9.2 | Bulk group assignment works         | `[x]` |                |
| 9.3 | CSV export downloads                | `[x]` |                |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**

```

```

---

## 10. Locale & Theme

| #    | Test                                               | Pass? | Feedback / Bug                                 |
| ---- | -------------------------------------------------- | ----- | ---------------------------------------------- |
| 10.1 | Switch EN → ID → all UI text in Indonesian         | `[x]` |                                                |
| 10.2 | Switch ID → EN → reverts to English                | `[x]` |                                                |
| 10.3 | Light mode → off-white background, near-black text | `[x]` |                                                |
| 10.4 | Dark mode → dark background, light text            | `[~]` | might want to consult to designer or UI expert |
| 10.5 | Locale choice persists after page refresh          | `[x]` |                                                |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**

```
might want to consult to designer or UI expert on light mode approach

```

---

## 11. Console & Network Health

| #    | Test                                                         | Pass? | Feedback / Bug |
| ---- | ------------------------------------------------------------ | ----- | -------------- |
| 11.1 | Dashboard — zero `[Error]` in DevTools console on clean load | `[ ]` |                |
| 11.2 | Attendance — zero `[Error]` in console                       | `[ ]` |                |
| 11.3 | Report — zero `[Error]` in console                           | `[ ]` |                |
| 11.4 | Machine (no SDK) — zero `[Error]` in console                 | `[ ]` |                |
| 11.5 | Network tab — no 500 responses on initial page loads         | `[ ]` |                |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**

```
might want to check later
```

---

## Summary

| Section               | Verdict |
| --------------------- | ------- |
| 1. Auth               | x       |
| 2. Dashboard          | x       |
| 3. Attendance         | x       |
| 4. Attendance Review  | x       |
| 5. Report             | x       |
| 6. Machine            | !       |
| 7. Employees          | x       |
| 8. Groups             | x       |
| 9. Schedule           | x       |
| 10. Locale & Theme    | ~       |
| 11. Console & Network | !       |

**Overall verdict:** `PASS / FAIL / PARTIAL`

---

## Blocking Issues

> Issues that must be fixed before release.

```

(paste here — one issue per line, include page + steps to reproduce)

```

---

## Non-Blocking Issues

> Cosmetic or low-priority — can ship, fix later.

```

(paste here)

```

---

## General Feedback

```

(anything else — UX impressions, confusing flows, suggestions)

```

```

```
