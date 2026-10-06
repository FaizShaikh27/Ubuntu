/* Practical 12: Child writes and parent reads System V shared memory.
 * First run: touch shmfile
 * The manual's unfinished parent branch is completed below.
 */
#include <stdio.h>
#include <stdlib.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include <string.h>
#include <unistd.h>
#include <sys/wait.h>

#define SHM_SIZE 1024

int main(void) {
    key_t key = ftok("shmfile", 65);
    if (key == -1) { perror("ftok (run touch shmfile first)"); return 1; }
    int shmid = shmget(key, SHM_SIZE, 0666 | IPC_CREAT);
    if (shmid == -1) { perror("shmget"); return 1; }
    pid_t pid = fork();
    if (pid < 0) { perror("fork"); shmctl(shmid, IPC_RMID, NULL); return 1; }
    if (pid == 0) {
        char *data = (char *)shmat(shmid, NULL, 0);
        if (data == (char *)(-1)) { perror("shmat in child"); return 1; }
        char message[] = "Hello from child process!";
        printf("Child writing message to shared memory: %s\n", message);
        strncpy(data, message, SHM_SIZE - 1);
        data[SHM_SIZE - 1] = '\0';
        if (shmdt(data) == -1) { perror("shmdt in child"); return 1; }
        return 0;
    } else {
        wait(NULL);
        char *data = (char *)shmat(shmid, NULL, 0);
        if (data == (char *)(-1)) {
            perror("shmat in parent"); shmctl(shmid, IPC_RMID, NULL); return 1;
        }
        printf("Parent read message from shared memory: %s\n", data);
        int status = 0;
        if (shmdt(data) == -1) { perror("shmdt in parent"); status = 1; }
        if (shmctl(shmid, IPC_RMID, NULL) == -1) { perror("shmctl"); status = 1; }
        return status;
    }
}
