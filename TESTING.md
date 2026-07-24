# Sangai Phase 1 — End-to-End Test

Use two separate browser profiles or one normal window and one private/incognito window.

## 1. Create Driver Account A

1. Open Sangai.
2. Click **Log in → Create account**.
3. Use a real test email and confirm it if email confirmation is enabled.
4. Log in.
5. Open **Profile → Edit profile**.
6. Add name, city, phone and a trusted contact.

Expected result: the information remains after refreshing and appears only where appropriate.

## 2. Publish a ride

With Account A:

1. Open **Offer seats**.
2. Publish Kathmandu → Hetauda for tomorrow.
3. Use 3 empty seats.
4. Open **My journeys → As driver**.

Expected result: the ride appears in Account A's driver dashboard and in the public ride search.

## 3. Create Passenger Account B

In another browser profile:

1. Create and log in to Account B.
2. Search Kathmandu → Hetauda for the same date.
3. Open Account A's ride.
4. Request one seat with a pickup point and message.

Expected result: Account B sees `requested`, and Account A receives the request in My journeys.

## 4. Review and accept

With Account A:

1. Open **My journeys → As driver**.
2. Open the passenger profile.
3. Click **Accept**.

Expected result:

- request status becomes `accepted`
- available seats decrease by exactly one
- a private conversation remains available
- Account B receives a notification

## 5. Test final-seat protection

1. Publish or edit the test scenario so only one seat remains.
2. Make two different passenger accounts request that last seat.
3. Accept the first request.
4. Try accepting the second.

Expected result: the database rejects the second acceptance because no seat remains.

This check is performed inside PostgreSQL, not only in the browser.

## 6. Test messages

1. Open Messages in both accounts.
2. Send a message from Account A.
3. Confirm it appears for Account B.
4. Reply from Account B.

Expected result: both users see the same private message history. Unrelated users cannot query it.

## 7. Cancel a passenger request

With Account B:

1. Open **My journeys → As passenger**.
2. Cancel the accepted request.

Expected result: the seat is returned to the ride unless the ride is already completed or cancelled.

## 8. Complete the ride

With Account A:

1. Mark the ride **Departing soon**.
2. Start the journey.
3. Complete the journey.

Expected result:

- ride status becomes completed
- accepted request becomes completed
- completed-journey counts increase
- review permission becomes available in the database

## 9. Security checks

Use a third unrelated account and verify it cannot:

- view private phone numbers
- view full vehicle registration details
- view another user's messages
- accept requests on another driver's ride
- update another user's profile
- create a request in another passenger's name

If any of these succeeds, stop the pilot and review the SQL policies before launch.
