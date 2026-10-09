# Term extraction on the laptop

Prompt-tuning numbers from llama-server on a laptop CPU. Quality numbers (parse rate, terms per page) carry over to the phones; speed does not. Phone speed comes from DevBench.

## smoke test (v0 prompt from main)

10/9/2026, 6:20:40 PM · model `google_gemma-3-1b-it-qat-Q4_0.gguf` · laptop CPU via llama-server · profile `android-cpu` (150-word chunks, 4 terms/chunk, 180 max tokens) · 1 runs per page

| Page | Chunks | JSON parsed | Cut off at max tokens | Valid unique terms per run | Sec/chunk | Tok/s |
|---|---|---|---|---|---|---|
| 1-it-audit.txt | 3 | 100% | 0/3 | 6 | 9.1 | 20.7 |
| 2-access-control.txt | 2 | 100% | 0/2 | 0 | 9.6 | 20.9 |
| 3-networking-ocr.txt | 2 | 100% | 0/2 | 6 | 8.8 | 21.1 |
| 4-cloud.txt | 3 | 67% | 2/3 | 1 | 10.3 | 19.4 |
| 5-databases.txt | 3 | 100% | 0/3 | 4 | 10.5 | 18.7 |

**Totals:** JSON parsed 92% · 2/5 page-runs reached 6+ terms (min 0, mean 3.4) · 48 terms proposed, rejected: {"too-long":23,"clue-leaks":8}

<details><summary>Kept and rejected terms (run 1)</summary>

**1-it-audit.txt**

- ✅ **IT audit**: An examination of an organization's digital infrastructure.
- ✅ **Assurance**: Provides a reasonable level of confidence in the effectiveness of systems.
- ✅ **Risk**: A potential failure that could hinder an organization's progress.
- ✅ **Materiality**: The extent to which an error impacts a decision.
- ✅ **COBIT**: This framework is a standard for IT governance, helping organizations align IT with business objectives.
- ✅ **audit trail**: The passage describes a detailed record of actions and changes, crucial for tracking data.
- ❌ too-long: **Segregation of duties**: This principle prevents fraud by ensuring no one can control a single transaction.
- ❌ clue-leaks: **Sampling**: Auditors use sampling to examine a portion of a large dataset, ensuring a representative sample.
- ❌ too-long: **Statistical methods**: These techniques provide a way to quantify the confidence in an auditor's findings.
- ❌ clue-leaks: **system log**: The auditor examines system logs to understand how applications and servers operate.
- ❌ too-long: **data protection controls**: Encryption is a method used to safeguard sensitive information, making it inaccessible without a key.
- ❌ too-long: **re-performed calculations**: The auditor verifies the accuracy of data by running calculations again.

**2-access-control.txt**

- ❌ too-long: **Access control**: The system's rules dictate who can enter and what they can access.
- ❌ too-long: **Identification**: A user's claim of being in the system, often using a username, is the first step.
- ❌ too-long: **Authentication**: Verification of a user's identity, involving factors like passwords and tokens, is crucial.
- ❌ too-long: **Authorization**: Granting specific rights to a user based on their identity is the next step.
- ❌ too-long: **privilege creep**: The passage describes a gradual accumulation of privileges, often unintended, that can quickly overwhelm systems.
- ❌ too-long: **role-based access control**: Organizations use roles to manage permissions, assigning them to specific duties and ensuring appropriate access.
- ❌ too-long: **administrator accounts**: These accounts possess significant power, requiring stringent security measures and monitoring.
- ❌ too-long: **orphan accounts**: Accounts that have been deactivated or removed, are flagged for immediate removal.

**3-networking-ocr.txt**

- ✅ **IP address**: A device's unique identifier on a network, like a street address.
- ✅ **MAC address**: A physical label burned onto a network card, directing data to the right destination.
- ✅ **Packet**: Small units of data that travel across a network, like letters in a postal system.
- ✅ **Router**: A device that connects different networks and directs traffic.
- ✅ **DNS**: The system translates names into addresses, crucial for communication across networks.
- ✅ **DMZ**: A firewall zone protects internal networks from external threats.
- ❌ clue-leaks: **IP address**: Each computer uses an IP address to identify itself on the internet.
- ❌ clue-leaks: **Latency**: The time it takes for data to travel between devices is measured as latency.

**4-cloud.txt**

- ✅ **Scalability**: A system's capacity to increase its operations, often by adding more components.
- ❌ too-long: **Cloud Computing**: The passage describes a service where companies rent computing power instead of owning hardware.
- ❌ too-long: **Infrastructure as a Service**: This model offers virtual machines, storage, and networks, allowing customers to manage their own OS and applications.
- ❌ too-long: **Platform as a Service**: This service provides a complete operating system and runtime, enabling developers to build and deploy applications.
- ❌ too-long: **Software as a Service**: This model delivers finished applications directly to users, like web-based email.
- ❌ too-long: **Availability Zones**: These are separate data centers within a region, ensuring application availability even if one fails.
- ❌ too-long: **High Availability**: This refers to the ability of a system to continue functioning when individual components fail.
- ❌ too-long: **Shared Responsibility Model**: The cloud provider handles physical security, while the customer manages data and user access.

**5-databases.txt**

- ✅ **Primary Key**: Each table has a unique identifier, like a student number, ensuring records are easily found.
- ✅ **isolation**: The notes describe systems where simultaneous actions don't disrupt each other, creating a stable environment.
- ✅ **durability**: The passage highlights that data changes are maintained even if the system experiences interruptions.
- ✅ **backup**: Regular data copies are essential for recovery in case of system failures.
- ❌ too-long: **Relational Database**: The passage describes a database structure where data is organized into tables with rows and columns.
- ❌ clue-leaks: **Foreign Key**: A foreign key connects tables, linking enrollment records to students.
- ❌ too-long: **Update Anomaly**: The passage highlights how inconsistent data can arise when the same information is repeated in multiple places.
- ❌ too-long: **update anomaly**: The passage describes a situation where data is inconsistent, a problem called an update anomaly, which is a significant issue.
- ❌ clue-leaks: **index**: A database index is like a bookshelf: it speeds up searching by quickly locating relevant records.
- ❌ clue-leaks: **transaction**: A transaction is a complete sequence of database operations, like transferring money or adding data.
- ❌ clue-leaks: **atomicity**: Atomicity ensures that all changes are either fully completed or completely undone, preventing data corruption.
- ❌ too-long: **administrator**: The notes emphasize the role of individuals responsible for safeguarding and managing information.

</details>

## v1: 12-letter rule, short clues, one example

10/9/2026, 6:25:03 PM · model `google_gemma-3-1b-it-qat-Q4_0.gguf` · laptop CPU via llama-server · profile `android-cpu` (150-word chunks, 4 terms/chunk, 180 max tokens) · 2 runs per page

| Page | Chunks | JSON parsed | Cut off at max tokens | Valid unique terms per run | Sec/chunk | Tok/s |
|---|---|---|---|---|---|---|
| 1-it-audit.txt | 3 | 100% | 0/6 | 7, 8 | 8.4 | 20.2 |
| 2-access-control.txt | 2 | 100% | 0/4 | 0, 0 | 9.0 | 19.5 |
| 3-networking-ocr.txt | 2 | 100% | 0/4 | 7, 7 | 8.3 | 20.6 |
| 4-cloud.txt | 3 | 100% | 0/6 | 6, 6 | 8.9 | 20.8 |
| 5-databases.txt | 3 | 100% | 0/6 | 7, 7 | 8.4 | 20.5 |

**Totals:** JSON parsed 100% · 8/10 page-runs reached 6+ terms (min 0, mean 5.5) · 104 terms proposed, rejected: {"too-long":47,"not-in-passage":2}

<details><summary>Kept and rejected terms (run 1)</summary>

**1-it-audit.txt**

- ✅ **IT audit**: An independent assessment of an organization's IT systems.
- ✅ **assurance**: Provides confidence in the effectiveness of IT systems.
- ✅ **risk**: A potential failure that could impact an organization's goals.
- ✅ **materiality**: The significance of an error that affects decision-making.
- ✅ **COBIT**: An ISACA framework for enterprise IT governance.
- ✅ **Sampling**: A statistical method used by auditors to determine confidence in results.
- ✅ **audit trail**: A record of actions taken and their order, meticulously documented.
- ❌ too-long: **Segregation of duties**: A principle requiring no one person can handle both approval and recording a payment.
- ❌ too-long: **Statistical methods**: Techniques used to analyze data and estimate probabilities.
- ❌ too-long: **data protection**: Measures taken to safeguard sensitive information.
- ❌ too-long: **re-performed calculations**: Repeating calculations to verify accuracy.
- ❌ too-long: **chronological record**: A sequence of events in order.

**2-access-control.txt**

- ❌ too-long: **Access control**: A system's method of determining who can access it.
- ❌ too-long: **Identification**: The process of proving a user's identity.
- ❌ too-long: **Authentication**: Verifying a user's claim through various methods.
- ❌ too-long: **Authorization**: Granting specific rights based on identity.
- ❌ too-long: **privilege creep**: The accumulation of unnecessary permissions over time, leading to security vulnerabilities.
- ❌ too-long: **role-based access control**: A system where permissions are tied to specific roles, like cashier or payroll clerk.
- ❌ too-long: **privilege creep**: The rapid increase in the number of accounts with elevated privileges, often without proper oversight.
- ❌ too-long: **administrator accounts**: Accounts with broad control, capable of changing settings and deleting logs.

**3-networking-ocr.txt**

- ✅ **IP address**: A unique identifier assigned to each device on a network.
- ✅ **MAC address**: A physical identifier burned into a network card.
- ✅ **packet**: Small units of data transmitted over a network.
- ✅ **firewall**: A barrier that allows or blocks network traffic based on rules.
- ✅ **DNS**: Translates a name such as a school website into the IP address that computers use.
- ✅ **DMZ**: A separate zone between the internet and the internal network, allowing secure access.
- ✅ **latency**: The delay before data arrives.
- ❌ too-long: **network fundamentals**: This module explores the core principles of how networks function.

**4-cloud.txt**

- ✅ **shrink**: A process of reducing size or volume.
- ✅ **scalability**: The capacity of a system to increase its workload.
- ✅ **data center**: A large, isolated facility housing servers and infrastructure.
- ✅ **vendor lock-in**: A situation where an application becomes trapped by a single provider, hindering flexibility.
- ✅ **latency**: The delay in data transmission, impacting application responsiveness.
- ✅ **total cost**: The cumulative expenses associated with a long-term service agreement.
- ❌ too-long: **Cloud Computing**: Companies rent computing resources online, paying only for what they use.
- ❌ too-long: **Infrastructure as a Service**: The provider manages the virtual machines, storage, and networks, allowing customers to manage the OS and apps.
- ❌ too-long: **Platform as a Service**: The provider runs the operating system and runtime, enabling developers to deploy code.
- ❌ too-long: **Software as a Service**: Customers simply use finished applications, like email, without managing the underlying system.
- ❌ too-long: **availability zone**: A separate data center within a cloud region.
- ❌ too-long: **data residency**: Regulations requiring data to be stored within a specific country's borders.

**5-databases.txt**

- ✅ **Primary Key**: A unique identifier for each row in a table.
- ✅ **Foreign Key**: A column in one table that references the primary key of another.
- ✅ **index**: A data structure that speeds up database searches.
- ✅ **transaction**: A sequence of operations that are treated as a single unit.
- ✅ **isolation**: Maintaining simultaneous operations without conflict.
- ✅ **durability**: Ensuring data remains intact even in unexpected events.
- ✅ **backup**: Creating copies of data for recovery.
- ❌ too-long: **Relational Database**: Data is organized into tables with rows and columns, like a spreadsheet.
- ❌ too-long: **Normalization**: A process of organizing data into related tables to avoid redundancy.
- ❌ too-long: **update anomaly**: A discrepancy in data that arises from a single change.
- ❌ not-in-passage: **SQL query**: A method for retrieving data from a database using a structured language.
- ❌ too-long: **administrator**: Responsible for data protection and user access.

</details>

## v2: v1 + prefer terms the passage explains

10/9/2026, 6:31:38 PM · model `google_gemma-3-1b-it-qat-Q4_0.gguf` · laptop CPU via llama-server · profile `android-cpu` (150-word chunks, 4 terms/chunk, 180 max tokens) · 3 runs per page

| Page | Chunks | JSON parsed | Cut off at max tokens | Valid unique terms per run | Same, if 14 letters allowed | Sec/chunk | Tok/s |
|---|---|---|---|---|---|---|---|
| 1-it-audit.txt | 3 | 100% | 0/9 | 7, 7, 7 | 7, 7, 7 | 8.1 | 20.6 |
| 2-access-control.txt | 2 | 100% | 0/6 | 0, 0, 0 | 5, 5, 5 | 8.4 | 20.5 |
| 3-networking-ocr.txt | 2 | 100% | 0/6 | 8, 7, 7 | 8, 7, 7 | 7.7 | 20.7 |
| 4-cloud.txt | 3 | 100% | 0/9 | 6, 6, 6 | 8, 8, 8 | 8.7 | 20.8 |
| 5-databases.txt | 3 | 100% | 0/9 | 7, 8, 8 | 10, 11, 11 | 8.6 | 20.3 |

**Totals:** JSON parsed 100% · 12/15 page-runs reached 6+ terms (min 0, mean 5.6) · with 14 letters allowed: 12/15 (min 5, mean 7.6) · 156 terms proposed, rejected: {"too-long":72}

<details><summary>Kept and rejected terms (run 1)</summary>

**1-it-audit.txt**

- ✅ **IT audit**: An independent examination of an organization's IT systems.
- ✅ **assurance**: Provides a reasonable level of confidence in the effectiveness of IT.
- ✅ **risk**: A chance of an event causing an organization to fail to meet its objectives.
- ✅ **materiality**: The size or nature of an error that would significantly impact a decision.
- ✅ **COBIT**: A framework from ISACA for enterprise IT governance.
- ✅ **sampling**: A method of testing a portion of a population to draw conclusions about the whole.
- ✅ **audit trail**: A record of all actions taken within a system.
- ❌ too-long: **segregation of duties**: A principle requiring no single person to approve or record a payment.
- ❌ too-long: **statistical methods**: Techniques used to measure auditor confidence in results.
- ❌ too-long: **data protection controls**: Security measures safeguarding data from unauthorized access.
- ❌ too-long: **re-performed calculations**: Repeating calculations to verify accuracy.
- ❌ too-long: **chronological record**: A sequence of events in order.

**2-access-control.txt**

- ❌ too-long: **Access control**: The system's security measures determine who can access it and what they can do.
- ❌ too-long: **Identification**: A user's claim to access a system is usually a username.
- ❌ too-long: **Authentication**: Verifying a user's identity using various methods.
- ❌ too-long: **Authorization**: Granting specific rights based on a user's identity.
- ❌ too-long: **privilege creep**: The accumulation of privileges over time, often leading to security vulnerabilities.
- ❌ too-long: **role-based access control**: A system where permissions are tied to specific roles, like cashier or payroll clerk.
- ❌ too-long: **privilege creep**: The gradual increase in access granted to accounts, creating risks.
- ❌ too-long: **administrator accounts**: Accounts with elevated privileges, requiring strict monitoring and protection.

**3-networking-ocr.txt**

- ✅ **network**: A system for connecting devices and sharing data.
- ✅ **IP address**: A unique identifier for a device on a network.
- ✅ **MAC address**: A physical address burned into a network card.
- ✅ **packet**: Small units of data transmitted over a network.
- ✅ **firewall**: A protective barrier that controls network access.
- ✅ **DNS**: A system for translating names to IP addresses.
- ✅ **DMZ**: A zone between the internet and internal networks.
- ✅ **latency**: The delay in data transmission.

**4-cloud.txt**

- ✅ **shrink**: A process of reducing size or volume.
- ✅ **scalability**: The capacity of a system to increase its workload.
- ✅ **data center**: A large, isolated facility housing servers and infrastructure.
- ✅ **vendor lock-in**: A situation where an application is completely dependent on a single provider's services, hindering flexibility.
- ✅ **latency**: The delay in data transmission, impacting application responsiveness.
- ✅ **total cost**: The cumulative expenses associated with using a particular provider's services over time.
- ❌ too-long: **Cloud Computing**: A service that delivers computing resources over the internet on demand.
- ❌ too-long: **Infrastructure as a Service**: A model where the provider supplies virtual machines, storage, and networks.
- ❌ too-long: **Platform as a Service**: A model where the provider runs the operating system and runtime.
- ❌ too-long: **Software as a Service**: A model where the customer simply uses a finished application.
- ❌ too-long: **availability zone**: A separate data center within a cloud region.
- ❌ too-long: **data residency**: Regulations requiring data to be stored within a specific geographic location.

**5-databases.txt**

- ✅ **primary key**: A unique identifier for each row in a table.
- ✅ **foreign key**: A column in one table that references the primary key of another.
- ✅ **index**: A data structure that speeds up database searches by quickly locating matching rows.
- ✅ **transaction**: A sequence of operations that are treated as a single unit of work.
- ✅ **isolation**: Maintaining simultaneous operations without disruption.
- ✅ **durability**: Ensuring data remains intact even in unexpected circumstances.
- ✅ **backup**: Creating copies of data for recovery.
- ❌ too-long: **relational database**: A database structured as tables with rows and columns.
- ❌ too-long: **normalization**: The process of organizing data into related tables.
- ❌ too-long: **update anomaly**: A situation where changes to one copy of data result in incorrect data across the entire database.
- ❌ too-long: **database query**: A method of retrieving information from a database using SQL.
- ❌ too-long: **administrator**: Responsible for data protection and user access.

</details>


## v3: v2 with the 15-letter limit (shipped, not yet measured)

The crossword now accepts answers up to 15 letters (#12), so the prompt says "at most 15 letters" instead of 12. Nothing else changed from v2. Not measured yet: llama-server and the model weren't reachable from the environment that made this change. v2's own run already hints at the effect: with 14 letters allowed, the same outputs gave min 5 and mean 7.6 terms per page-run instead of min 0 and mean 5.6, and "too-long" was the only rejection reason.

Run it on the laptop and append the results here:

```bash
LLAMA_URL=http://127.0.0.1:8089 RUNS=3 LABEL="v3: 15-letter limit" npx jest -c jest.bench.config.js
```

Note: earlier sections name rejection reasons with the old ids (`too-long`, `clue-leaks`); new runs use the app's messages from `rejectReason` (`answer over 15 letters`, `clue gives the answer away`).
